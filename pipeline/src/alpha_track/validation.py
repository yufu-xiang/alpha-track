"""寫入前驗證閘門。規格 §8.1。

核心原則:絕不用壞資料覆蓋好資料。
整批被拒時,呼叫端應保留前一日資料並將 meta 標記為 stale ——
寧可顯示昨天的正確數字,也不要顯示今天的錯誤數字。
"""
from __future__ import annotations

from collections.abc import Collection, Sequence
from dataclasses import dataclass, field
from datetime import date

from .models import NavRecord, PriceRecord

COUNT_DROP_TOLERANCE = 0.10
"""檔數較前一日減少超過此比例即整批拒絕。"""

LARGE_MOVE_THRESHOLD = 0.15
"""單日漲跌幅超過此值且當日無除息,標記為異常。"""

LARGE_PREMIUM_THRESHOLD = 0.10
"""折溢價絕對值超過此值即標記。

規格 §8.1 特別註明**不可擋** —— 台股確實出現過超過 10% 的溢價
(尤其是流動性差或受追捧的主題型 ETF)。這是需要被看見的事實,
不是要被過濾掉的雜訊;擋掉它等於把最該警示使用者的那一天藏起來。
"""


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


def validate_navs(records: Sequence[NavRecord]) -> ValidationResult:
    """驗證淨值批次。規格 §8.1。

    這裡沒有「整批拒絕」:淨值來源只有當日快照、沒有歷史,漏掉一天就是
    永久少一天,補不回來。拒絕整批的代價因此遠高於價格 ——
    價格拒絕一批,明天還抓得到同一天的資料;淨值拒絕一批,那天就沒了。
    """
    result = ValidationResult()
    for r in records:
        pd = r.premium_discount
        if pd is None:
            # 淨值非正數,折溢價算不出來。寫進去只會讓一欄看起來有資料。
            result.flagged.append((r.code, f"淨值 {r.nav} 非正數,略過"))
            continue
        if abs(pd) > LARGE_PREMIUM_THRESHOLD:
            result.flagged.append((
                r.code,
                f"折溢價 {pd:+.1%} 超過 {LARGE_PREMIUM_THRESHOLD:.0%},請留意",
            ))
        result.accepted.append(r)
    return result
