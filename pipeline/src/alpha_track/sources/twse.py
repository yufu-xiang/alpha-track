"""TWSE adapter(上市)。端點與欄位名依 docs/data-sources.md 的實測記錄。

涵蓋三個形狀不同的端點:
  - openapi 每日行情 —— list[dict],民國年無分隔,無千分位逗號
  - 舊站 ETF 靜態清單 —— {fields, data},**西元年**句點
  - 舊站逐月報酬指數 —— {stat, fields, data},民國年斜線,**含**千分位逗號
"""
from __future__ import annotations

import re
from datetime import date

from ..models import DividendRecord, EtfProfile, NavRecord, PriceRecord
from .base import (
    parse_ad_dot, parse_roc_cjk, parse_roc_compact, parse_roc_slash, to_float,
)


def parse_twse_daily(payload: list[dict], trade_date: date) -> list[PriceRecord]:
    """解析每日收盤行情。無成交或欄位缺失的列一律略過。

    日期取自每一列自己的 Date(民國年無分隔),trade_date 僅為缺欄位時的退路:
    本端點是「最新交易日快照」且不吃日期參數,呼叫端傳的是 date.today(),
    週末、假日或交易所延遲出檔時會把前一交易日的價格標上今天(ledger R19)。
    """
    rows: list[PriceRecord] = []
    for item in payload:
        code = str(item.get("Code", "")).strip()
        close = to_float(item.get("ClosingPrice"))
        if not code or close is None or close <= 0:
            continue
        row_date = parse_roc_compact(item.get("Date")) or trade_date
        open_ = to_float(item.get("OpeningPrice")) or close
        high = to_float(item.get("HighestPrice")) or close
        low = to_float(item.get("LowestPrice")) or close
        volume = to_float(item.get("TradeVolume")) or 0.0
        rows.append(PriceRecord(
            code=code, date=row_date, open=open_, high=high, low=low,
            close=close, volume=int(volume), adj_close=close,
        ))
    return rows


def parse_twse_profiles(payload: list[dict], exchange: str) -> list[EtfProfile]:
    """自每日行情擷取代號與名稱。

    TWSE 的每日行情已含 Name 欄位,不取用的話排行榜的「名稱」欄只能顯示代號。
    掛牌日本端點不提供,留 None —— 由 parse_twse_etf_list 補上真實掛牌日
    (ledger R14),不要用「最早有資料的日期」當代理值。
    """
    profiles: list[EtfProfile] = []
    for item in payload:
        code = str(item.get("Code", "")).strip()
        name = str(item.get("Name", "")).strip()
        if not code or not name:
            continue
        profiles.append(EtfProfile(code=code, name=name,
                                   listing_date=None, exchange=exchange))
    return profiles


def _rows_by_field(payload: object) -> list[dict[str, str]]:
    """把舊站的 {fields: [...], data: [[...]]} 轉成依欄名索引的 dict。

    依**名稱**對位而非位置:欄位順序變動時位置取值會靜默錯亂,
    而名稱取不到值會乾淨地變成空字串,由呼叫端的必填檢查擋下。
    """
    if not isinstance(payload, dict):
        return []
    fields = [str(f).strip() for f in (payload.get("fields") or [])]
    # null 要轉成空字串,不能交給 str():str(None) 是 "None",看起來像有值。
    # 實測官方 ETF 清單 232 列中有 25 列的「標的指數」是 null(主動式 ETF
    # 本來就沒有追蹤指數),不處理的話資料庫裡就有 25 檔追蹤一個叫 None 的指數。
    return [dict(zip(fields, ["" if c is None else str(c) for c in row]))
            for row in (payload.get("data") or [])]


def parse_twse_etf_list(payload: dict) -> list[EtfProfile]:
    """解析上市 ETF 靜態清單(掛牌日、發行人、追蹤指數)。

    掛牌日必須取自這裡,不可用「最早有價格資料的日期」當代理值:
    Yahoo 的 0050 歷史自 2009 起,實際掛牌日是 2003-06-30,兩者差 5 年半。
    注意本端點的日期是**西元年**句點格式,與其他 TWSE 端點的民國年不同。

    回應是 {stat, fields, data},data 為二維字串陣列 —— 不是 list[dict]
    (ledger R21)。誤照 list[dict] 解析會回傳空清單而不報錯,
    於是掛牌日靜默地全部落回代理值,正是 R14 要防的那個錯誤。
    """
    profiles: list[EtfProfile] = []
    for item in _rows_by_field(payload):
        listing_date = parse_ad_dot(item.get("上市日期"))
        issuer = item.get("發行人", "").strip() or None
        tracking_index = item.get("標的指數", "").strip() or None
        codes = _split_dual_currency(item.get("證券代號", ""))
        names = _split_dual_currency(item.get("證券簡稱", ""))
        for i, code in enumerate(codes):
            name = names[i] if i < len(names) else ""
            if not code or not name:
                continue
            profiles.append(EtfProfile(
                code=code, name=name, listing_date=listing_date,
                exchange="TWSE", issuer=issuer, tracking_index=tracking_index,
            ))
    return profiles


def _split_dual_currency(cell: str) -> list[str]:
    """拆開雙幣別 ETF 的儲存格,並去掉標註幣別的括號。

    官方清單把雙幣別 ETF 的兩個代號塞在**同一格**,以 HTML 換行連接:
    `'006205(新臺幣)<br>00625K(人民幣)'`、
    `'富邦上証(新臺幣)<br>富邦上証+R(人民幣)'`。實測 232 列中有 7 列如此。

    不拆的話這 14 個代號的掛牌日全部取不到(它們在行情裡是獨立的兩檔),
    同時還會產生一個帶著 HTML、永遠對不上任何行情的假代號。
    """
    parts = re.split(r"<br\s*/?>", cell, flags=re.IGNORECASE)
    return [re.sub(r"[(（].*?[)）]", "", part).strip() for part in parts]


def parse_twse_total_return_legacy(payload: dict) -> list[tuple[date, float]]:
    """解析舊站逐月加權報酬指數(Beta 與超額報酬的基準,ledger R15)。

    先檢查 stat:超出範圍時回應是 HTTP 200 加
    {"stat": "查詢日期小於92年1月，請重新查詢!", "total": 0},既無 data 也無 fields。
    不擋下來的話,回補會把「查詢失敗」當成「這個月沒有交易日」,
    十年基準靜默補成空的,Beta 全數為 null 而沒有任何錯誤訊息。

    日期是民國年斜線格式且可能有前導空格;指數值**含千分位逗號**,
    與 openapi 版不同(見 docs/data-sources.md 第 7 點)。
    """
    stat = str((payload or {}).get("stat", "")).strip()
    if stat != "OK":
        raise ValueError(f"TWSE 舊站報酬指數查詢未成功:{stat or '回應缺少 stat'}")

    rows: list[tuple[date, float]] = []
    for item in _rows_by_field(payload):
        # 欄名是「日　期」,兩字之間夾一個全形空格。
        raw_date = next(
            (v for k, v in item.items() if k.replace("　", "") == "日期"), None)
        raw_value = next((v for k, v in item.items() if "報酬指數" in k), None)
        parsed = parse_roc_slash(raw_date)
        value = to_float(raw_value)
        if parsed is not None and value is not None:
            rows.append((parsed, value))
    return rows


def parse_twse_mis_etf(payload: dict) -> list[NavRecord]:
    """解析 TWSE MIS 的 ETF 淨值揭露快照(`mis.twse.com.tw/stock/data/all_etf.txt`)。

    **欄位代號是實測解出來的,不是猜的**(2026-08-26,357 檔):

    | 鍵 | 內容 | 判定依據 |
    |---|---|---|
    | `a` | 證券代號 | 與我方 codes 相符 |
    | `b` | 基金全名 | |
    | `c` | 已發行受益權單位數 | |
    | `d` | 單位數當日增減 | |
    | `e` | **市價** | 見下 |
    | `f` | **淨值(預估)** | 見下 |
    | `g` | **折溢價%** | `(e−f)/f×100` 與 `g` 在 357 筆中 99.7% 落在 0.06 以內,中位偏差 0.0029 |
    | `h` | 前一日淨值 | 與 `f` 的差異在槓桿型上最大(00715L 5.18%),與 2 倍槓桿的單日淨值變動相符 |
    | `i` `j` | 日期 `YYYYMMDD`、時間 | |
    | `k` | 發行人分組 1–4 | |

    我方不採用 `g`,而是由 NavRecord.premium_discount 自 nav 與 market_price
    重算。理由是 `g` 在無成交時會回報 `0` —— 那不是「平價」而是「不知道」,
    照收會讓一檔沒人交易的 ETF 在折溢價榜上顯示得比誰都健康。

    **這是預估淨值,不是官方結算淨值。** 各投信的正式淨值於盤後另行公告,
    此處取的是交易所揭露的估值。兩者通常極接近,但不是同一個數字,
    docs/data-sources.md 已註明。

    **此端點只有當日快照,沒有歷史。** 折溢價因此只能逐日累積,
    而不是一次回補 —— 規格 §4.4 要求的 20 個交易日樣本需要二十個交易日。
    """
    rows: list[NavRecord] = []
    blocks = payload.get("a1") or []
    for block in blocks:
        for item in block.get("msgArray", []):
            code = str(item.get("a", "")).strip()
            nav = to_float(item.get("f"))
            market = to_float(item.get("e"))
            trade_date = _parse_mis_date(item.get("i"))
            # 市價為 0 代表當日無成交。折溢價無從談起,整列略過 ——
            # 寫成 0 會被讀成「完全貼合淨值」,那是最健康的狀態,
            # 而實情是這檔今天沒有人買賣。
            if not code or trade_date is None or nav is None or market is None:
                continue
            if nav <= 0 or market <= 0:
                continue
            rows.append(NavRecord(code=code, date=trade_date, nav=nav,
                                  market_price=market,
                                  fund_size=to_float(item.get("c"))))
    return rows


def _parse_mis_date(raw: object) -> date | None:
    """`"20260826"` → date。這個端點用西元年,與 openapi 的民國年不同。"""
    text = str(raw or "").strip()
    if len(text) != 8 or not text.isdigit():
        return None
    try:
        return date(int(text[:4]), int(text[4:6]), int(text[6:]))
    except ValueError:
        return None


def parse_twse_ex_rights(payload: dict) -> list[DividendRecord]:
    """解析證交所除權除息計算結果表(TWT49U)。

    一次請求可取整個日期區間的**全市場**紀錄(實測 2024 全年 1184 筆,
    其中 232 筆是 ETF),因此回補十年只要十幾次請求。

    這個來源的價值不在配息金額本身(FinMind 已經有),而在
    **除權息前收盤價** —— 那是當時的真實價格,未經分割還原。
    我方的價格序列來自 Yahoo、已被還原,兩者的比值就是累積分割倍率。
    沒有它,分割過的標的在股息再投入試算裡會離譜地錯(實測 0050 高估 155.6%)。

    只取「息」:「權」是股票股利,會改變股數而非給付現金,
    當成配息金額算進去會憑空多出一筆錢。
    """
    rows: list[DividendRecord] = []
    for item in payload.get("data") or []:
        if not isinstance(item, list) or len(item) < 7:
            continue
        ex_date = parse_roc_cjk(item[0])
        code = str(item[1]).strip()
        prev_close = to_float(item[3])
        amount = to_float(item[5])
        kind = str(item[6]).strip()
        if ex_date is None or not code or amount is None or kind != "息":
            continue
        rows.append(DividendRecord(
            code=code, ex_date=ex_date, pay_date=None,
            amount=amount, prev_close=prev_close,
        ))
    return rows
