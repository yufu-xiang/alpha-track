import pytest

from alpha_track.metrics.risk import (
    annualized_volatility,
    beta,
    daily_returns,
    max_drawdown,
    sharpe,
)


def test_daily_returns_computes_successive_changes():
    assert daily_returns([100.0, 110.0, 99.0]) == pytest.approx([0.10, -0.10])


def test_daily_returns_of_single_price_is_empty():
    assert daily_returns([100.0]) == []


def test_annualized_volatility_of_known_series():
    """[+1%, -1%, +1%, -1%] 的樣本標準差 × sqrt(252)。手算值 0.183306。"""
    rets = [0.01, -0.01, 0.01, -0.01]
    assert annualized_volatility(rets) == pytest.approx(0.183306, rel=1e-4)


def test_volatility_of_constant_prices_is_zero():
    assert annualized_volatility(daily_returns([50.0] * 30)) == pytest.approx(0.0)


def test_volatility_needs_at_least_two_returns():
    assert annualized_volatility([0.01]) is None
    assert annualized_volatility([]) is None


def test_max_drawdown_finds_worst_peak_to_trough():
    """峰 120 → 谷 90,回撤 -25%。後續漲到 150 不影響歷史最大回撤。"""
    assert max_drawdown([100.0, 120.0, 90.0, 150.0]) == pytest.approx(-0.25)


def test_max_drawdown_of_monotonic_rise_is_zero():
    assert max_drawdown([100.0, 110.0, 120.0]) == pytest.approx(0.0)


def test_max_drawdown_uses_earlier_peak_not_later_one():
    """先跌 50% 再創新高後小跌,最大回撤仍是最初那次 -50%。"""
    assert max_drawdown([100.0, 50.0, 200.0, 180.0]) == pytest.approx(-0.50)


def test_max_drawdown_of_empty_series_is_none():
    assert max_drawdown([]) is None


def test_sharpe_divides_excess_return_by_volatility():
    assert sharpe(0.115, 0.20, 0.015) == pytest.approx(0.50)


def test_sharpe_is_none_when_volatility_is_zero():
    """波動為零時 Sharpe 無定義。回傳 None 而非 inf —— inf 會汙染排序。"""
    assert sharpe(0.10, 0.0, 0.015) is None


def test_sharpe_is_none_when_volatility_is_none():
    assert sharpe(0.10, None, 0.015) is None


def test_beta_of_identical_series_is_one():
    rets = [0.01, -0.02, 0.015, 0.003, -0.008]
    assert beta(rets, rets) == pytest.approx(1.0)


def test_beta_of_double_amplitude_series_is_two():
    bench = [0.01, -0.02, 0.015, 0.003, -0.008]
    asset = [r * 2 for r in bench]
    assert beta(asset, bench) == pytest.approx(2.0)


def test_beta_is_none_when_benchmark_has_no_variance():
    assert beta([0.01, 0.02], [0.0, 0.0]) is None


def test_beta_is_none_on_length_mismatch():
    """長度不一致代表資料對齊出錯,回傳 None 而非默默截斷。"""
    assert beta([0.01, 0.02, 0.03], [0.01, 0.02]) is None
