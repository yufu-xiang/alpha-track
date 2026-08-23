"""FinMind adapter。配息紀錄,用於交叉驗證還原股價(規格 §4.1)。"""
from __future__ import annotations

from datetime import date

from ..models import DividendRecord
from .base import to_float


def parse_finmind_dividends(payload: dict) -> list[DividendRecord]:
    """解析配息資料(dataset=TaiwanStockDividend,免費層可用)。

    回應層級的 status/msg 與 HTTP status 分離,兩者都要檢查 ——
    免費層存取付費 dataset 時是 HTTP 400 加 status=400,
    但單靠 data 是否為空無法區分「查詢失敗」與「這檔沒配過息」。

    此 dataset 同時含股票股利與現金股利欄位,且日期欄位可能是空字串
    (實測 StockExDividendTradingDate 與 AnnouncementDate 常為 "")。
    只取現金股利:ETF 的還原價調整來自配息,配股在 ETF 幾乎不存在。
    """
    if payload.get("status") not in (None, 200):
        raise ValueError(f"FinMind 查詢未成功:{payload.get('msg')}")

    items = payload.get("data") or []
    rows: list[DividendRecord] = []
    for item in items:
        code = str(item.get("stock_id", "")).strip()
        ex_raw = str(item.get("CashExDividendTradingDate") or item.get("date") or "").strip()
        amount = to_float(item.get("CashEarningsDistribution"))
        if not code or not ex_raw or amount is None or amount <= 0:
            continue
        pay_raw = str(item.get("CashDividendPaymentDate") or "").strip()
        rows.append(DividendRecord(
            code=code,
            ex_date=date.fromisoformat(ex_raw),
            pay_date=date.fromisoformat(pay_raw) if pay_raw else None,
            amount=amount,
        ))
    return rows
