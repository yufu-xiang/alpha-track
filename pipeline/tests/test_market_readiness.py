from datetime import date, datetime, timezone

from alpha_track.market_readiness import (
    evaluate_readiness,
    market_closed_reason,
    parse_market_date,
    target_market_date,
)


def test_target_date_starts_at_17_taipei_and_continues_next_morning():
    assert target_market_date(datetime(2026, 9, 8, 8, 59, tzinfo=timezone.utc)) == date(2026, 9, 7)
    assert target_market_date(datetime(2026, 9, 8, 9, 0, tzinfo=timezone.utc)) == date(2026, 9, 8)
    assert target_market_date(datetime(2026, 9, 8, 23, 0, tzinfo=timezone.utc)) == date(2026, 9, 8)


def test_parse_market_date_supports_roc_and_gregorian_formats():
    assert parse_market_date("1150908") == date(2026, 9, 8)
    assert parse_market_date("115/09/08") == date(2026, 9, 8)
    assert parse_market_date("20260908") == date(2026, 9, 8)
    assert parse_market_date("--") is None


def test_weekend_and_holiday_are_closed():
    assert market_closed_reason(date(2026, 9, 12), []) == "週末休市"
    rows = [{"Name": "中秋節", "Date": "1150925", "Description": "依規定放假1日。"}]
    assert market_closed_reason(date(2026, 9, 25), rows) == "中秋節"


def test_special_opening_or_last_trading_day_is_not_closed():
    rows = [
        {
            "Name": "農曆春節前最後交易日",
            "Date": "1150211",
            "Description": "農曆春節前最後交易。",
        }
    ]
    assert market_closed_reason(date(2026, 2, 11), rows) is None


def test_ready_only_when_both_markets_have_target_date():
    target = date(2026, 9, 8)
    result = evaluate_readiness(
        target=target,
        holiday_rows=[],
        published_date=date(2026, 9, 7),
        twse_rows=[{"Date": "1150908"}],
        tpex_rows=[{"Date": "1150907"}],
    )
    assert result.state == "pending"

    result = evaluate_readiness(
        target=target,
        holiday_rows=[],
        published_date=date(2026, 9, 7),
        twse_rows=[{"Date": "1150908"}],
        tpex_rows=[{"Date": "1150908"}],
    )
    assert result.state == "ready"


def test_existing_data_prevents_duplicate_update():
    target = date(2026, 9, 8)
    result = evaluate_readiness(
        target=target,
        holiday_rows=[],
        published_date=target,
        twse_rows=[],
        tpex_rows=[],
    )
    assert result.state == "already_done"
