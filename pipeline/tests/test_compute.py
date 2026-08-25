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


def bench_from(prices, factor: float = 1.0, on=None):
    """由價格序列生一條同交易日的基準線;factor 控制基準漲幅相對標的的比例。"""
    days = on if on is not None else [p.date for p in prices]
    base = 1000.0
    out, first = {}, prices[0].adj_close
    for p in prices:
        if p.date in days:
            out[p.date] = base * (1 + (p.adj_close / first - 1) * factor)
    return out


def test_excess_equals_the_full_return_when_the_market_is_flat():
    """規格 §4.5b:改提供相對加權報酬指數的超額報酬 ——
    「這檔有沒有贏大盤」才是使用者真正在問的問題。
    大盤不動時,超額報酬就等於標的自己的報酬。"""
    prices = series(date(2025, 1, 1), [100.0 + i * 0.05 for i in range(400)])
    flat = {p.date: 1000.0 for p in prices}
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes=flat, navs=[], listing_date=None)
    assert m.excess["Y1"] == pytest.approx(m.returns["Y1"])


def test_excess_is_zero_when_the_etf_tracks_the_market_exactly():
    """完全複製大盤時超額為零 —— 這是定義的另一個端點。"""
    prices = series(date(2025, 1, 1), [100.0 + i * 0.05 for i in range(400)])
    same = {p.date: p.adj_close * 10 for p in prices}
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes=same, navs=[], listing_date=None)
    assert m.excess["Y1"] == pytest.approx(0.0, abs=1e-9)


def test_excess_is_negative_when_the_etf_loses_to_the_market():
    prices = series(date(2025, 1, 1), [100.0 + i * 0.05 for i in range(400)])
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes=bench_from(prices, 2.0), navs=[],
                            listing_date=None)
    assert m.excess["Y1"] < 0


def test_excess_has_the_same_keys_as_returns():
    """前端可直接索引,不必先檢查鍵是否存在 —— 與 returns/annualized 一致。"""
    prices = series(date(2025, 1, 1), [100.0] * 400)
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes=bench_from(prices), navs=[], listing_date=None)
    assert set(m.excess) == set(m.returns)


def test_excess_is_all_none_without_benchmark_data():
    prices = series(date(2025, 1, 1), [100.0 + i * 0.05 for i in range(400)])
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert all(v is None for v in m.excess.values())


def test_excess_is_none_for_periods_the_benchmark_does_not_cover():
    """基準自 2016 年起,更早的期間算不出超額 —— 留 null,不拿短期間頂替。"""
    prices = series(date(2020, 1, 1), [100.0 + i * 0.01 for i in range(2000)])
    late = [p.date for p in prices if p.date >= date(2024, 1, 1)]
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes=bench_from(prices, 1.0, on=late),
                            navs=[], listing_date=None)
    assert m.excess["Y1"] is not None, "一年期在基準涵蓋範圍內"
    assert m.excess["Y5"] is None, "五年期起點早於基準,應為 null"


def test_excess_tolerates_a_benchmark_that_lags_by_a_day():
    """實測:基準最新到 08-24 而價格已到 08-25(來源出檔時間差)。
    要求日期精確吻合的話,超額報酬會整批變成 null。"""
    prices = series(date(2025, 1, 1), [100.0 + i * 0.05 for i in range(400)])
    lagged = [p.date for p in prices[:-1]]          # 少最後一天
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes=bench_from(prices, 0.5, on=lagged),
                            navs=[], listing_date=None)
    assert m.excess["Y1"] is not None


def test_excess_does_not_reach_back_arbitrarily_far():
    """回看是為了容忍出檔時間差,不是拿幾週前的指數硬湊。"""
    prices = series(date(2025, 1, 1), [100.0 + i * 0.05 for i in range(400)])
    stale = [p.date for p in prices[:-30]]          # 基準停在 30 天前
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes=bench_from(prices, 0.5, on=stale),
                            navs=[], listing_date=None)
    assert m.excess["Y1"] is None


def test_volatility_uses_a_trailing_window_not_the_whole_history():
    """全歷史波動度不可比較:十年歷史與兩年歷史的基金,量在不同長度、
    不同市場環境的窗口上,並排排序本身就不對等。改取近一年。"""
    calm = [100.0 + i * 0.01 for i in range(300)]
    wild = [100.0 * (1.3 if i % 2 else 0.7) for i in range(300)]
    prices = series(date(2022, 1, 1), wild + calm)   # 早期劇烈、近期平穩
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.volatility is not None and m.volatility < 0.5, \
        "近期平穩就該顯示低波動,不該被五年前的劇烈期拉高"


def test_sharpe_numerator_and_denominator_share_the_same_window():
    """分子取近一年報酬、分母取全歷史波動度會讓多頭年份的夏普值爆掉
    ——實測 289 檔中有 84 檔(29%)大於 2,而判讀門檻正是 2。"""
    values = [100.0 * (1.0008 ** i) for i in range(600)]
    prices = series(date(2024, 1, 1), values)
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    # 仍可用畫面上的兩個數字自行驗算
    assert m.sharpe == pytest.approx((m.returns["Y1"] - 0.015) / m.volatility)


def test_volatility_falls_back_to_available_history_when_shorter_than_a_year():
    """歷史不足一年者用手上有的,不因此整欄留白。"""
    prices = series(date(2026, 1, 1), [100.0 + i * 0.05 for i in range(120)])
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.volatility is not None


def test_volatility_still_requires_the_minimum_sample():
    prices = series(date(2026, 8, 1), [100.0 + i * 0.05 for i in range(20)])
    m = compute_etf_metrics(prices, prices[-1].date, risk_free=0.015,
                            bench_closes={}, navs=[], listing_date=None)
    assert m.volatility is None
