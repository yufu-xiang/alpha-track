from datetime import date

from alpha_track.models import PriceRecord
from alpha_track.validation import validate_price_batch


def price(code: str, close: float, d=date(2026, 8, 21)) -> PriceRecord:
    return PriceRecord(code=code, date=d, open=close, high=close, low=close,
                       close=close, volume=1000, adj_close=close)


def test_clean_batch_is_fully_accepted():
    batch = [price("0050", 195.0), price("0056", 40.0)]
    r = validate_price_batch(batch, previous_count=2,
                             previous_closes={"0050": 194.0, "0056": 39.9},
                             dividend_ex_dates=set())
    assert r.batch_rejected is False
    assert len(r.accepted) == 2
    assert r.flagged == []


def test_batch_rejected_when_count_drops_more_than_ten_percent():
    """規格 §8.1:檔數驟減通常代表 API 改格式,整批拒絕。"""
    batch = [price("0050", 195.0)]
    r = validate_price_batch(batch, previous_count=100,
                             previous_closes={}, dividend_ex_dates=set())
    assert r.batch_rejected is True
    assert "檔數" in r.batch_reason
    assert r.accepted == []


def test_batch_accepted_when_count_drop_is_within_tolerance():
    batch = [price(f"00{i:03d}", 10.0) for i in range(95)]
    r = validate_price_batch(batch, previous_count=100,
                             previous_closes={}, dividend_ex_dates=set())
    assert r.batch_rejected is False
    assert len(r.accepted) == 95


def test_first_run_with_no_previous_count_is_accepted():
    """首次執行沒有前一日基準,不得因此拒絕整批。"""
    batch = [price("0050", 195.0)]
    r = validate_price_batch(batch, previous_count=0,
                             previous_closes={}, dividend_ex_dates=set())
    assert r.batch_rejected is False
    assert len(r.accepted) == 1


def test_large_move_without_dividend_is_flagged_but_still_accepted():
    """規格 §8.1:標記異常但仍寫入,交由人工判讀。"""
    batch = [price("0056", 30.0)]
    r = validate_price_batch(batch, previous_count=1,
                             previous_closes={"0056": 40.0},
                             dividend_ex_dates=set())
    assert len(r.accepted) == 1
    assert len(r.flagged) == 1
    assert r.flagged[0][0] == "0056"
    assert "除息" in r.flagged[0][1]


def test_large_move_on_ex_dividend_date_is_not_flagged():
    batch = [price("0056", 30.0)]
    r = validate_price_batch(batch, previous_count=1,
                             previous_closes={"0056": 40.0},
                             dividend_ex_dates={("0056", date(2026, 8, 21))})
    assert r.flagged == []


def test_small_move_is_not_flagged():
    batch = [price("0050", 200.0)]
    r = validate_price_batch(batch, previous_count=1,
                             previous_closes={"0050": 195.0},
                             dividend_ex_dates=set())
    assert r.flagged == []


def test_code_without_previous_close_is_not_flagged():
    """新掛牌 ETF 沒有前一日收盤,不應被誤判為異常。"""
    batch = [price("00999", 15.0)]
    r = validate_price_batch(batch, previous_count=1,
                             previous_closes={}, dividend_ex_dates=set())
    assert r.flagged == []
    assert len(r.accepted) == 1


def test_empty_batch_is_rejected_when_previous_data_existed():
    r = validate_price_batch([], previous_count=250,
                             previous_closes={}, dividend_ex_dates=set())
    assert r.batch_rejected is True
