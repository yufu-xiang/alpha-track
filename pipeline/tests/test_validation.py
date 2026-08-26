from datetime import date

from alpha_track.models import NavRecord, PriceRecord
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


class TestValidateNavs:
    """規格 §8.1:折溢價 |x| > 10% **寫入但標記**,不可擋。"""

    @staticmethod
    def nav(code: str, nav: float, market: float) -> NavRecord:
        return NavRecord(code=code, date=date(2026, 8, 26), nav=nav, market_price=market)

    def test_large_premium_is_flagged_but_still_written(self):
        """台股確實出現過超過 10% 的溢價。擋掉它等於把最該警示的那天藏起來。"""
        from alpha_track.validation import validate_navs
        r = validate_navs([self.nav("00940", 10.0, 11.5)])
        assert [x.code for x in r.accepted] == ["00940"]
        assert r.flagged and "折溢價" in r.flagged[0][1]

    def test_normal_premium_is_not_flagged(self):
        from alpha_track.validation import validate_navs
        r = validate_navs([self.nav("0050", 100.0, 100.5)])
        assert len(r.accepted) == 1
        assert r.flagged == []

    def test_non_positive_nav_is_dropped(self):
        from alpha_track.validation import validate_navs
        r = validate_navs([NavRecord(code="X", date=date(2026, 8, 26),
                                     nav=0.0, market_price=10.0)])
        assert r.accepted == []
        assert r.flagged

    def test_never_rejects_the_whole_batch(self):
        """淨值來源只有當日快照,漏掉一天就永久少一天 —— 整批拒絕的代價太高。"""
        from alpha_track.validation import validate_navs
        r = validate_navs([self.nav(f"{i:05d}", 10.0, 20.0) for i in range(50)])
        assert r.batch_rejected is False
        assert len(r.accepted) == 50
