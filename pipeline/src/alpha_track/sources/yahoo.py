"""Yahoo Finance adapter。僅用於歷史回補(規格 §3.1)。

非官方來源,可能變更或中斷。每日增量以官方 TWSE/TPEx 為主,
因此 Yahoo 失效時每日更新仍持續,只是暫時無法新增歷史回補。
"""
from __future__ import annotations

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from ..models import PriceRecord

logger = logging.getLogger(__name__)

TAIPEI = ZoneInfo("Asia/Taipei")

MAX_PLAUSIBLE_DAILY_MOVE = 0.35
"""超過此幅度的單日變動視為來源未調整的分割,不是行情。

台股上市證券單日漲跌幅上限 10%;槓桿型 ETF 20%;追蹤海外指數者雖不受限,
實務上也從未有單日 35% 的紀錄。分割的倍率(2、4、10)遠在此門檻之外,
因此不需要猜倍率是多少,只要認出「這不可能是行情」就夠了。
"""


def parse_yahoo_chart(payload: dict, code: str) -> list[PriceRecord]:
    """解析 chart API 回應。

    優先取 adjclose(還原權值價)。來源未提供時退回 close,
    此時報酬會是價格報酬而非含息報酬 —— 呼叫端須記錄此情況。

    粒度檢查不可省略:Yahoo 對長歷史標的會把 interval=1d 靜默降頻為月線,
    HTTP 200 且不報錯,只有 meta.dataGranularity 會變(實測 0050.TW 從 4322 筆
    逐日變成 213 筆月線)。月線被當成日線存入,波動度、最大回撤、Beta 全部會錯,
    而且錯得非常像真的。寧可拋例外中斷,也不要讓錯誤資料進資料庫(ledger R13)。
    """
    chart = payload.get("chart") or {}
    results = chart.get("result")
    if not results:
        return []

    result = results[0]
    granularity = (result.get("meta") or {}).get("dataGranularity")
    if granularity is not None and granularity != "1d":
        raise ValueError(
            f"{code} 的回應粒度為 {granularity},非日線。"
            f"請改用 period1/period2 明確指定區間,不要用 range=max。"
        )
    timestamps = result.get("timestamp") or []
    indicators = result.get("indicators") or {}
    quotes = (indicators.get("quote") or [{}])[0]

    adj_list = None
    adjclose_block = indicators.get("adjclose")
    if adjclose_block:
        adj_list = adjclose_block[0].get("adjclose")

    rows: list[PriceRecord] = []
    for i, ts in enumerate(timestamps):
        close = _at(quotes.get("close"), i)
        if close is None or close <= 0:
            continue
        adj = _at(adj_list, i)
        if adj is None or adj <= 0:
            adj = close
        rows.append(PriceRecord(
            code=code,
            # 時間戳是當日 09:00 台北時間(01:00 UTC),轉台北時區取日期。
            date=datetime.fromtimestamp(ts, TAIPEI).date(),
            open=_at(quotes.get("open"), i) or close,
            high=_at(quotes.get("high"), i) or close,
            low=_at(quotes.get("low"), i) or close,
            close=close,
            volume=int(_at(quotes.get("volume"), i) or 0),
            adj_close=adj,
        ))
    return _drop_history_before_unadjusted_split(rows, code)


def _drop_history_before_unadjusted_split(
    rows: list[PriceRecord], code: str
) -> list[PriceRecord]:
    """砍掉最後一次尺度斷裂之前的歷史,只保留最近的連續區段。

    Yahoo 的 adjclose 只做配息回溯調整,**分割不一定含在內**,而且
    `events` 裡也不保證有 `splits` 可供偵測 —— 實測 0050.TW 在 2014-01-02
    有一次 1:4 分割(價格比 0.2494、成交股數 ×4.96 而成交金額連續、
    兩側 close/adj 比值同為 1.5785),回應中完全沒有任何欄位提及它。

    未處理的話,跨越該日的指標全部是安靜的錯誤數字:MDD 變成 -77%(實為
    分割本身)、全歷史波動度被一天灌爆、成立以來報酬低估約四倍。

    這裡刻意**不**回推倍率去修正舊資料 —— 那是拿猜測填進資料庫,違反
    「資料不足就是 null,不用替代值」。捨棄斷裂前的區段則不發明任何數字:
    `data_start` 自然變成分割日,compute 的掛牌日閘門(R14)就會據此
    把「成立以來」正確地標成 null。
    """
    for i in range(len(rows) - 1, 0, -1):
        prev = rows[i - 1].adj_close
        if prev <= 0:
            continue
        if abs(rows[i].adj_close / prev - 1.0) > MAX_PLAUSIBLE_DAILY_MOVE:
            logger.warning(
                "%s 在 %s 有 %.1f%% 的單日跳空,判定為來源未調整的分割;"
                "捨棄該日之前的 %d 筆歷史,起點改為 %s",
                code, rows[i].date, (rows[i].adj_close / prev - 1.0) * 100,
                i, rows[i].date,
            )
            return rows[i:]
    return rows


def _at(seq: list | None, i: int) -> float | None:
    if not seq or i >= len(seq):
        return None
    value = seq[i]
    return float(value) if value is not None else None
