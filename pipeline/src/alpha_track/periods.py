"""期間起點計算。

規格 §4.2:用日曆日往回推,取當天或之前最近的交易日。
不用交易日數的原因:各檔 ETF 停牌與掛牌日不同,用交易日數會使比較區間對不齊。
"""
from __future__ import annotations

import bisect
from collections.abc import Sequence
from datetime import date

from dateutil.relativedelta import relativedelta

from .models import Period

_CALENDAR_OFFSET = {
    Period.W1: relativedelta(days=7),
    Period.M1: relativedelta(months=1),
    Period.M3: relativedelta(months=3),
    Period.M6: relativedelta(months=6),
    Period.Y1: relativedelta(years=1),
    Period.Y3: relativedelta(years=3),
    Period.Y5: relativedelta(years=5),
    Period.Y10: relativedelta(years=10),
}


def period_start(
    base: date, period: Period, trading_days: Sequence[date]
) -> date | None:
    """回傳期間起點的交易日,資料不足時回傳 None。

    trading_days 須為已排序的交易日清單。回傳 None 代表該 ETF 的歷史
    不足以涵蓋此期間 —— 呼叫端應輸出 null 並將其排除於該期間排名之外。
    """
    if not trading_days:
        return None

    if period is Period.INCEPTION:
        return trading_days[0]

    if period is Period.D1:
        idx = bisect.bisect_left(trading_days, base)
        return trading_days[idx - 1] if idx >= 1 else None

    if period is Period.YTD:
        target = date(base.year, 1, 1)
        idx = bisect.bisect_left(trading_days, target)
        return trading_days[idx] if idx < len(trading_days) else None

    target = base - _CALENDAR_OFFSET[period]
    if target < trading_days[0]:
        return None
    # 取「當天或之前」最近的交易日
    idx = bisect.bisect_right(trading_days, target)
    return trading_days[idx - 1] if idx >= 1 else None
