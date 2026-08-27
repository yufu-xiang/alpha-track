"""資料來源的健康檢查。

要防的是一種特定的壞法:**私有端點靜默回空**。已經發生過三次 ——
公會的表單少帶 radio 就回原本的頁面(HTTP 200、沒有錯誤訊息);
MIS 的無成交列回 0 而非空值;CI 快取鍵固定讓 navs 每天被打回原點。
三次都沒有任何東西變紅。
"""
from __future__ import annotations

from datetime import date

import pytest

from alpha_track.health import DROP_TOLERANCE, HOLDINGS_STALE_DAYS, check_sources

TODAY = date(2026, 8, 27)


class FakeDb:
    """只實作 check_sources 用到的那幾個方法。"""

    def __init__(self, *, prices_today=350, prices_prev=350, navs_today=350,
                 navs_prev=350, prev_day=date(2026, 8, 26),
                 dividends_with_prev=10_000, holdings_month="202607"):
        self._p = {TODAY: prices_today, prev_day: prices_prev} if prev_day else {TODAY: prices_today}
        self._n = {TODAY: navs_today, prev_day: navs_prev} if prev_day else {TODAY: navs_today}
        self._prev = prev_day
        self._div = dividends_with_prev
        self._hm = holdings_month

    def count_prices_on(self, d): return self._p.get(d, 0)
    def count_navs_on(self, d): return self._n.get(d, 0)
    def previous_trading_day(self, _d): return self._prev
    def count_dividends_with_prev_close(self): return self._div
    def latest_holdings_month(self): return self._hm


def reasons(db) -> str:
    return " | ".join(r for _, r in check_sources(db, TODAY))


def test_a_healthy_day_reports_nothing():
    assert check_sources(FakeDb(), TODAY) == []


def test_prices_dropping_sharply_is_reported():
    """來源改版最常見的樣子:還是 HTTP 200,只是筆數少了一截。"""
    db = FakeDb(prices_today=200, prices_prev=350)
    assert "價格自 350 筆降為 200 筆" in reasons(db)


def test_a_drop_within_tolerance_is_not_reported():
    """常駐的警告等於沒有警告。停牌與新上市會讓筆數天天小幅浮動。"""
    db = FakeDb(prices_today=int(350 * (1 - DROP_TOLERANCE / 2)), prices_prev=350)
    assert check_sources(db, TODAY) == []


def test_zero_navs_is_called_out_specifically():
    """淨值抓不到過去 —— 今天沒抓到就是永久少一天,補不回來。

    所以它不能只是「比昨天少」的一般警告,要講清楚後果。
    """
    db = FakeDb(navs_today=0)
    assert "永久" in reasons(db) or "補不回來" in reasons(db)


def test_first_run_has_no_baseline_and_stays_quiet():
    """首次執行沒有前一日可比。

    這裡刻意不退回絕對門檻:絕對門檻會在標的數成長之後
    變成一個永遠不會響的警報。
    """
    db = FakeDb(prev_day=None, holdings_month="202607")
    assert [r for _, r in check_sources(db, TODAY) if "價格" in r] == []


def test_missing_prev_close_breaks_scale_conversion():
    db = FakeDb(dividends_with_prev=0)
    assert "尺度" in reasons(db)


def test_stale_holdings_are_reported():
    """公會的表單改版時查詢會靜默失敗,月份就停在原地。"""
    db = FakeDb(holdings_month="202601")
    assert "成分股停留在 202601" in reasons(db)


def test_normal_monthly_lag_is_not_stale():
    """公會每月第 10 個營業日公布上個月的資料,正常落後約四十天。

    以月**初**起算的話這個正常落後會看起來多出三十天,
    門檻就必須放寬,而放寬到最後就抓不到真正的停滯。
    """
    db = FakeDb(holdings_month="202607")   # 2026-08-27 距 2026-07-31 是 27 天
    assert [r for _, r in check_sources(db, TODAY) if "成分股" in r] == []


def test_no_holdings_at_all_is_reported():
    assert "沒有任何成分股" in reasons(FakeDb(holdings_month=None))


@pytest.mark.parametrize("month", ["", "abcd", "20261"])
def test_a_malformed_month_is_treated_as_stale_not_ignored(month):
    """月份格式壞掉代表某處已經出錯。當成正常放過去是最糟的選擇。"""
    assert "成分股" in reasons(FakeDb(holdings_month=month))


def test_the_stale_threshold_leaves_room_for_one_missed_publication():
    """門檻要大於正常落後、小於漏掉一整個月份。"""
    assert 40 < HOLDINGS_STALE_DAYS < 100
