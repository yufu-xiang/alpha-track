from datetime import date

from alpha_track.data_watchdog import validate_dates


def test_detects_deployment_lag_even_if_repo_is_current():
    issues = validate_dates(
        repo_date=date(2026, 9, 16), site_date=date(2026, 9, 11),
        twse_date=date(2026, 9, 16), tpex_date=date(2026, 9, 16),
    )
    assert len(issues) == 1
    assert "部署沒有跟上" in issues[0]


def test_detects_data_pipeline_lag_even_if_site_matches_repo():
    issues = validate_dates(
        repo_date=date(2026, 9, 15), site_date=date(2026, 9, 15),
        twse_date=date(2026, 9, 16), tpex_date=date(2026, 9, 16),
    )
    assert len(issues) == 1
    assert "官方行情已到" in issues[0]


def test_unequal_market_dates_only_require_last_common_day():
    issues = validate_dates(
        repo_date=date(2026, 9, 16), site_date=date(2026, 9, 16),
        twse_date=date(2026, 9, 17), tpex_date=date(2026, 9, 16),
    )
    assert issues == []
