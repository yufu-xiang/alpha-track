"""TPEx OpenAPI adapter(上櫃 ETF)。端點與欄位名依 docs/data-sources.md。

規格 §3.1 把上櫃列為獨立來源是有原因的:債券型 ETF(代號結尾 B,如 00679B)
幾乎全在上櫃,TWSE 的端點查不到。實測單日 1011 檔上櫃證券中含 117 檔 ETF。

用 tpex_mainboard_quotes 而非 tpex_mainboard_daily_close_quotes:
兩者的 ETF 代碼集合相同,但後者含大量債券代碼,體積大 10 倍(4.15MB / 10634 筆)。
"""
from __future__ import annotations

from datetime import date

from ..models import EtfProfile, PriceRecord
from .base import parse_roc_compact, to_float

EXCHANGE = "TPEX"


def parse_tpex_daily(payload: list[dict], trade_date: date) -> list[PriceRecord]:
    """解析上櫃收盤行情。無成交的列以 '----' 表示,一律略過而非寫入零價。

    日期取自該列自己的 Date,理由同 parse_twse_daily(ledger R19)。
    """
    rows: list[PriceRecord] = []
    for item in payload:
        code = str(item.get("SecuritiesCompanyCode", "")).strip()
        close = to_float(item.get("Close"))
        if not code or close is None or close <= 0:
            continue
        row_date = parse_roc_compact(item.get("Date")) or trade_date
        volume = to_float(item.get("TradingShares")) or 0.0
        rows.append(PriceRecord(
            code=code, date=row_date,
            open=to_float(item.get("Open")) or close,
            high=to_float(item.get("High")) or close,
            low=to_float(item.get("Low")) or close,
            close=close, volume=int(volume), adj_close=close,
        ))
    return rows


def parse_tpex_profiles(payload: list[dict]) -> list[EtfProfile]:
    """自上櫃行情擷取代號與名稱。

    exchange 標為 TPEX 不只是分類欄位 —— 回補時決定 Yahoo 用 .TWO 還是 .TW
    後綴,標錯會讓整檔回補乾淨地 404(見 docs/data-sources.md 第 8 點)。
    """
    profiles: list[EtfProfile] = []
    for item in payload:
        code = str(item.get("SecuritiesCompanyCode", "")).strip()
        name = str(item.get("CompanyName", "")).strip()
        if not code or not name:
            continue
        profiles.append(EtfProfile(code=code, name=name,
                                   listing_date=None, exchange=EXCHANGE))
    return profiles
