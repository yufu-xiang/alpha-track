from datetime import date

import pytest

from alpha_track.metrics.returns import cagr, total_return, years_between


def test_total_return_uses_adjusted_prices():
    """規格 §4.1:含息報酬 = 期末還原價 / 期初還原價 - 1。"""
    assert total_return(100.0, 120.0) == pytest.approx(0.20)


def test_total_return_handles_loss():
    assert total_return(100.0, 75.0) == pytest.approx(-0.25)


def test_total_return_rejects_non_positive_start():
    with pytest.raises(ValueError, match="起始還原價必須為正數"):
        total_return(0.0, 120.0)


def test_years_between_uses_actual_day_count():
    assert years_between(date(2025, 8, 21), date(2026, 8, 21)) == pytest.approx(
        365 / 365.25, rel=1e-3
    )


def test_cagr_of_one_year_equals_total_return():
    assert cagr(0.20, 1.0) == pytest.approx(0.20)


def test_cagr_compounds_over_multiple_years():
    """三年翻倍 → 年化約 25.99%。"""
    assert cagr(1.0, 3.0) == pytest.approx(0.259921, rel=1e-5)


def test_cagr_returns_none_for_zero_or_negative_years():
    assert cagr(0.20, 0.0) is None
    assert cagr(0.20, -1.0) is None


def test_cagr_of_total_loss_is_negative_one():
    """資產歸零:年化報酬為 -100%,不論期間長短。"""
    assert cagr(-1.0, 5.0) == pytest.approx(-1.0)


def test_cagr_returns_none_when_value_goes_below_zero():
    """總報酬低於 -100% 在數學上無法年化(負數開根號),回傳 None 而非 NaN。"""
    assert cagr(-1.5, 3.0) is None
