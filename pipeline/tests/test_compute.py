from datetime import date, timedelta

import pytest

from alpha_track.compute import compute_etf_metrics
from alpha_track.models import NavRecord, PriceRecord


def series(start: date, values: list[float], code="0050") -> list[PriceRecord]:
    """建立每日連續的價格序列(含週末,測試不需真實行事曆)。"""
    return [
        PriceRecord(code=code, date=start + timedelta(days=i), open=v, high=v,
                    low=v, close=v, volume=1000, adj_close=v)
        for i, v in enumerate(values)
    ]


def test_returns_none_for_periods_longer_than_history():
    """規格 §4.3:歷史不足該期間時輸出 None,不參與排名。"""
    prices = series(date(2026, 8, 1), [100.0] * 21)
    base = prices[-1].date
    m = compute_etf_metrics(prices, base, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.returns["Y10"] is None
    assert m.returns["Y1"] is None
    assert m.returns["INCEPTION"] == pytest.approx(0.0)


def test_computes_inception_return_over_full_history():
    prices = series(date(2026, 1, 1), [100.0, 110.0])
    base = prices[-1].date
    m = compute_etf_metrics(prices, base, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.returns["INCEPTION"] == pytest.approx(0.10)


def test_d1_return_uses_previous_trading_day():
    prices = series(date(2026, 8, 1), [100.0, 100.0, 105.0])
    base = prices[-1].date
    m = compute_etf_metrics(prices, base, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.returns["D1"] == pytest.approx(0.05)


def test_annualized_only_populated_for_long_periods():
    """規格 §4.2:一年以內不年化。"""
    values = [100.0 + i * 0.05 for i in range(1500)]  # 約四年
    prices = series(date(2022, 1, 1), values)
    base = prices[-1].date
    m = compute_etf_metrics(prices, base, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.annualized["M3"] is None
    assert m.annualized["Y1"] is None
    assert m.annualized["Y3"] is not None


def test_risk_metrics_none_when_sample_too_short():
    """規格 §4.4:少於 60 個交易日不計算波動度與 MDD。"""
    prices = series(date(2026, 8, 1), [100.0] * 20)
    base = prices[-1].date
    m = compute_etf_metrics(prices, base, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.volatility is None
    assert m.mdd is None


def test_constant_price_gives_zero_volatility_and_none_sharpe():
    prices = series(date(2025, 1, 1), [100.0] * 300)
    base = prices[-1].date
    m = compute_etf_metrics(prices, base, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.volatility == pytest.approx(0.0)
    assert m.sharpe is None, "波動為零時 Sharpe 無定義"


def test_sharpe_reproduces_from_the_displayed_return_and_volatility():
    """規格 §7 要求數字可被檢驗:使用者拿畫面上的年報酬、波動度與無風險利率
    應能自行算出畫面上的 Sharpe。分子分母的窗口不同(見 compute.py 註解),
    但兩者都是畫面上顯示的那個值,所以仍然對得起來。"""
    values = [100.0 * (1.0003 ** i) for i in range(400)]
    prices = series(date(2025, 1, 1), values)
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.sharpe == pytest.approx(
        (m.returns["Y1"] - 0.015) / m.volatility)


def test_premium_discount_taken_from_latest_nav():
    prices = series(date(2026, 8, 1), [40.4] * 21, code="0056")
    base = prices[-1].date
    navs = [NavRecord(code="0056", date=base, nav=40.0,
                      market_price=40.4, fund_size=None)]
    m = compute_etf_metrics(prices, base, risk_free=0.015,
                            bench_closes={}, navs=navs, listing_date=None)
    assert m.premium_discount == pytest.approx(0.01)


def test_premium_discount_is_none_without_nav_data():
    prices = series(date(2026, 8, 1), [40.4] * 21, code="0056")
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.premium_discount is None


def test_inception_is_null_when_history_does_not_reach_listing_date():
    """Yahoo 的 0050 歷史自 2009 起,實際掛牌日 2003-06-30。
    把 2009 起算的報酬標成「成立以來」是個安靜的錯誤數字。"""
    prices = series(date(2009, 1, 2), [100.0 + i * 0.05 for i in range(300)])
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes={}, navs=[],
                            listing_date=date(2003, 6, 30))
    assert m.returns["INCEPTION"] is None
    assert m.data_start == date(2009, 1, 2)


def test_inception_is_computed_when_history_reaches_listing_date():
    prices = series(date(2023, 6, 9), [100.0 + i * 0.05 for i in range(300)])
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes={}, navs=[],
                            listing_date=date(2023, 6, 9))
    assert m.returns["INCEPTION"] is not None


def test_inception_tolerates_a_few_days_gap_from_the_listing_date():
    """免費資料源的起始日常與掛牌日差幾個交易日,不必因此整欄作廢。"""
    prices = series(date(2023, 6, 20), [100.0 + i * 0.05 for i in range(300)])
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes={}, navs=[],
                            listing_date=date(2023, 6, 9))
    assert m.returns["INCEPTION"] is not None


def test_inception_is_computed_when_listing_date_is_unknown():
    """掛牌日不明時不能因此放棄 INCEPTION —— 那會讓多數新 ETF 整欄空白。"""
    prices = series(date(2023, 6, 9), [100.0] * 100)
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.returns["INCEPTION"] == pytest.approx(0.0)


def test_beta_computed_when_benchmark_aligns_on_the_same_dates():
    """規格 §4.4:Beta 對大盤迴歸。基準以日期對齊,長度自然相等。"""
    values = [100.0 + i * 0.1 for i in range(400)]
    prices = series(date(2025, 1, 1), values)
    bench = {p.date: p.adj_close for p in prices}  # 與標的完全同步
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes=bench, navs=[], listing_date=None)
    assert m.beta == pytest.approx(1.0)


def test_beta_is_none_when_benchmark_data_absent():
    values = [100.0 + i * 0.1 for i in range(400)]
    prices = series(date(2025, 1, 1), values)
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.beta is None


def test_beta_ignores_benchmark_dates_the_etf_does_not_have():
    """基準的交易日多於標的時,只取交集,不得長度不符而放棄計算。"""
    values = [100.0 + i * 0.1 for i in range(400)]
    prices = series(date(2025, 1, 1), values)
    bench = {p.date: p.adj_close for p in prices}
    bench[date(2030, 1, 1)] = 999.0  # 標的沒有的日期
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes=bench, navs=[], listing_date=None)
    assert m.beta is not None


def test_beta_is_none_when_overlap_is_shorter_than_a_year():
    """規格 §4.4:Beta 最低樣本一年。交集不足時留空,不給勉強的數字。"""
    values = [100.0 + i * 0.1 for i in range(400)]
    prices = series(date(2025, 1, 1), values)
    bench = {p.date: p.adj_close for p in prices[:100]}
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes=bench, navs=[], listing_date=None)
    assert m.beta is None


def test_all_none_when_no_price_dated_on_or_before_base_date():
    """守住 max() 對空序列拋 ValueError 的情況 —— 單一壞代號不得中斷整批匯出。"""
    prices = series(date(2026, 9, 1), [100.0] * 5)
    m = compute_etf_metrics(prices, date(2026, 8, 21), risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert all(v is None for v in m.returns.values())


def test_ignores_prices_dated_after_the_base_date():
    """匯出以基準日為準。晚於基準日的列若被納入,報酬會用到「未來」的價格。"""
    prices = series(date(2026, 8, 1), [100.0] * 20 + [999.0] * 5)
    base = date(2026, 8, 20)  # 第 20 筆
    m = compute_etf_metrics(prices, base, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.returns["INCEPTION"] == pytest.approx(0.0), "不得看到 999"


def test_empty_price_history_yields_all_none():
    m = compute_etf_metrics([], date(2026, 8, 21), risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert all(v is None for v in m.returns.values())
    assert m.volatility is None
