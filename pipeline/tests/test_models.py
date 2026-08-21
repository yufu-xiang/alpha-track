from datetime import date

import pytest

from alpha_track.models import DividendRecord, EtfProfile, NavRecord, Period, PriceRecord


def test_price_record_holds_normalized_fields():
    r = PriceRecord(code="0050", date=date(2026, 8, 21), open=194.0, high=196.0,
                    low=193.5, close=195.5, volume=12_345_678, adj_close=195.5)
    assert r.code == "0050"
    assert r.adj_close == 195.5


def test_price_record_rejects_non_positive_close():
    with pytest.raises(ValueError, match="close 必須為正數"):
        PriceRecord(code="0050", date=date(2026, 8, 21), open=1.0, high=1.0,
                    low=1.0, close=0.0, volume=0, adj_close=1.0)


def test_nav_record_computes_premium_discount():
    """折溢價 = (市價 - 淨值) / 淨值,由型別自行計算,避免各處重複實作。"""
    r = NavRecord(code="0056", date=date(2026, 8, 21), nav=40.0,
                  market_price=40.4, fund_size=1_000_000.0)
    assert r.premium_discount == pytest.approx(0.01)


def test_nav_record_premium_is_none_when_nav_is_zero():
    r = NavRecord(code="0056", date=date(2026, 8, 21), nav=0.0,
                  market_price=40.4, fund_size=None)
    assert r.premium_discount is None


def test_period_codes_are_exactly_the_eleven_in_spec():
    assert [p.value for p in Period] == [
        "D1", "W1", "M1", "M3", "M6", "YTD", "Y1", "Y3", "Y5", "Y10", "INCEPTION"
    ]


def test_period_knows_whether_it_should_be_annualized():
    """規格 §4.2:一年以上才年化。"""
    assert Period.Y3.annualize is True
    assert Period.Y1.annualize is False
    assert Period.M3.annualize is False
    assert Period.INCEPTION.annualize is True


def test_dividend_record_holds_ex_date_and_amount():
    d = DividendRecord(code="0056", ex_date=date(2026, 7, 16),
                       pay_date=date(2026, 8, 14), amount=0.85)
    assert d.amount == 0.85


def test_etf_profile_defaults_unknown_fields_to_none():
    p = EtfProfile(code="0050", name="元大台灣50", listing_date=date(2003, 6, 30),
                   exchange="TWSE")
    assert p.expense_ratio is None
    assert p.category is None
