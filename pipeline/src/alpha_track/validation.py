"""寫入前驗證閘門。規格 §8.1。

核心原則:絕不用壞資料覆蓋好資料。
整批被拒時,呼叫端應保留前一日資料並將 meta 標記為 stale ——
寧可顯示昨天的正確數字,也不要顯示今天的錯誤數字。
"""
from __future__ import annotations

from collections.abc import Collection, Sequence
from dataclasses import dataclass, field
from datetime import date

from .models import PriceRecord

COUNT_DROP_TOLERANCE = 0.10
"""檔數較前一日減少超過此比例即整批拒絕。"""

LARGE_MOVE_THRESHOLD = 0.15
"""單日漲跌幅超過此值且當日無除息,標記為異常。"""


@dataclass
class ValidationResult:
    accepted: list[PriceRecord] = field(default_factory=list)
    flagged: list[tuple[str, str]] = field(default_factory=list)
    """(代號, 原因)。已寫入但需人工檢查。"""
    batch_rejected: bool = False
    batch_reason: str | None = None


def validate_price_batch(
    records: Sequence[PriceRecord],
    previous_count: int,
    previous_closes: dict[str, float],
    dividend_ex_dates: Collection[tuple[str, date]],
) -> ValidationResult:
    """驗證單日價格批次。

    previous_count 為 0 代表首次執行,此時不做檔數比對。
    """
    result = ValidationResult()

    if previous_count > 0:
        threshold = previous_count * (1 - COUNT_DROP_TOLERANCE)
        if len(records) < threshold:
            result.batch_rejected = True
            result.batch_reason = (
                f"檔數自 {previous_count} 降為 {len(records)},"
                f"減幅超過 {COUNT_DROP_TOLERANCE:.0%},疑似 API 格式變更"
            )
            return result

    ex_dates = set(dividend_ex_dates)
    for r in records:
        prev = previous_closes.get(r.code)
        if prev is not None and prev > 0:
            change = r.close / prev - 1.0
            if abs(change) > LARGE_MOVE_THRESHOLD and (r.code, r.date) not in ex_dates:
                result.flagged.append((
                    r.code,
                    f"單日變動 {change:+.1%} 超過門檻但當日無除息紀錄",
                ))
        result.accepted.append(r)

    return result
