"""Yahoo Finance adapter。僅用於歷史回補(規格 §3.1)。

非官方來源,可能變更或中斷。每日增量以官方 TWSE/TPEx 為主,
因此 Yahoo 失效時每日更新仍持續,只是暫時無法新增歷史回補。
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from ..models import PriceRecord

TAIPEI = ZoneInfo("Asia/Taipei")


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
    return rows


def _at(seq: list | None, i: int) -> float | None:
    if not seq or i >= len(seq):
        return None
    value = seq[i]
    return float(value) if value is not None else None
