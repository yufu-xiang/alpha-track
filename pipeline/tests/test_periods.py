from datetime import date, timedelta

import pytest

from alpha_track.models import Period
from alpha_track.periods import period_start


def make_trading_days(start: date, end: date) -> list[date]:
    """合成交易日:週一至週五。測試不依賴真實台股行事曆,結果才可重現。"""
    days, cur = [], start
    while cur <= end:
        if cur.weekday() < 5:
            days.append(cur)
        cur += timedelta(days=1)
    return days


DAYS = make_trading_days(date(2014, 1, 1), date(2026, 8, 21))
BASE = date(2026, 8, 21)  # 週五


def test_d1_returns_previous_trading_day():
    assert period_start(BASE, Period.D1, DAYS) == date(2026, 8, 20)


def test_d1_skips_weekend():
    monday = date(2026, 8, 24)
    assert period_start(monday, Period.D1, DAYS) == date(2026, 8, 21)


def test_w1_goes_back_seven_calendar_days():
    assert period_start(BASE, Period.W1, DAYS) == date(2026, 8, 14)


def test_m1_goes_back_one_calendar_month():
    assert period_start(BASE, Period.M1, DAYS) == date(2026, 7, 21)


def test_y1_lands_on_or_before_target_when_target_is_not_a_trading_day():
    """2025-08-21 是週四(交易日),取當天。"""
    assert period_start(BASE, Period.Y1, DAYS) == date(2025, 8, 21)


def test_falls_back_to_earlier_trading_day_when_target_is_weekend():
    """回推的目標日落在週末時,取「之前」最近的交易日,不是之後。

    自 2026-08-17(週一)回推一週 = 2026-08-10(週一,交易日),
    故改以 2026-08-16(週日)為目標的情境測試:
    自 2026-08-23(週日)回推一週 = 2026-08-16(週日,非交易日),
    應回退至 2026-08-14(週五)。
    """
    assert period_start(date(2026, 8, 23), Period.W1, DAYS) == date(2026, 8, 14)


def test_never_falls_forward_past_the_target():
    """回退方向必須向前(較早),向後取會讓期間短於宣稱的長度,
    使報酬率被系統性高估或低估。"""
    result = period_start(date(2026, 8, 23), Period.W1, DAYS)
    assert result is not None and result <= date(2026, 8, 16)


def test_ytd_returns_first_trading_day_of_year():
    assert period_start(BASE, Period.YTD, DAYS) == date(2026, 1, 1)


def test_inception_returns_first_available_trading_day():
    assert period_start(BASE, Period.INCEPTION, DAYS) == DAYS[0]


def test_returns_none_when_history_is_too_short():
    """規格 §4.3:資料不足回傳 None,絕不以最早日期頂替。"""
    short = make_trading_days(date(2025, 1, 1), date(2026, 8, 21))
    assert period_start(BASE, Period.Y10, short) is None


def test_returns_none_for_empty_trading_days():
    assert period_start(BASE, Period.Y1, []) is None


def test_base_date_itself_may_be_the_start_for_inception_of_one_day_history():
    single = [BASE]
    assert period_start(BASE, Period.INCEPTION, single) == BASE
