import sqlite3
from datetime import date
from pathlib import Path

import pytest

from alpha_track.models import DividendRecord, EtfProfile, NavRecord, PriceRecord
from alpha_track.storage import Database


def price(code="0050", d=date(2026, 8, 21), close=195.5, adj=195.5) -> PriceRecord:
    return PriceRecord(code=code, date=d, open=194.0, high=196.0, low=193.0,
                       close=close, volume=1000, adj_close=adj)


@pytest.fixture
def db(tmp_path: Path):
    with Database(tmp_path / "test.db") as d:
        d.init_schema()
        yield d


def test_upsert_then_read_roundtrip(db):
    db.upsert_prices([price()])
    got = db.get_prices("0050")
    assert len(got) == 1
    assert got[0].close == 195.5


def test_upsert_is_idempotent(db):
    """規格 §3.4:同一天重跑任意次數不產生重複列。"""
    db.upsert_prices([price()])
    db.upsert_prices([price()])
    db.upsert_prices([price()])
    assert len(db.get_prices("0050")) == 1


def test_upsert_updates_existing_row_rather_than_duplicating(db):
    db.upsert_prices([price(close=195.5)])
    db.upsert_prices([price(close=200.0)])
    got = db.get_prices("0050")
    assert len(got) == 1
    assert got[0].close == 200.0


def test_get_prices_returns_chronological_order(db):
    db.upsert_prices([
        price(d=date(2026, 8, 21)),
        price(d=date(2026, 8, 19)),
        price(d=date(2026, 8, 20)),
    ])
    dates = [p.date for p in db.get_prices("0050")]
    assert dates == [date(2026, 8, 19), date(2026, 8, 20), date(2026, 8, 21)]


def test_trading_days_are_distinct_and_sorted(db):
    db.upsert_prices([
        price(code="0050", d=date(2026, 8, 20)),
        price(code="0056", d=date(2026, 8, 20)),
        price(code="0050", d=date(2026, 8, 21)),
    ])
    assert db.trading_days() == [date(2026, 8, 20), date(2026, 8, 21)]


def test_latest_price_date_on_empty_db_is_none(db):
    assert db.latest_price_date() is None


def test_latest_price_date_returns_max(db):
    db.upsert_prices([price(d=date(2026, 8, 19)), price(d=date(2026, 8, 21))])
    assert db.latest_price_date() == date(2026, 8, 21)


def test_nav_roundtrip_preserves_premium_discount(db):
    db.upsert_navs([NavRecord(code="0056", date=date(2026, 8, 21), nav=40.0,
                              market_price=40.4, fund_size=1e9)])
    rows = db.get_navs("0056")
    assert rows[0].premium_discount == pytest.approx(0.01)


def test_dividend_upsert_is_idempotent(db):
    d = DividendRecord(code="0056", ex_date=date(2026, 7, 16),
                       pay_date=date(2026, 8, 14), amount=0.85)
    db.upsert_dividends([d, d])
    assert len(db.get_dividends("0056")) == 1


def test_profile_upsert_and_all_codes(db):
    db.upsert_profiles([
        EtfProfile(code="0050", name="元大台灣50",
                   listing_date=date(2003, 6, 30), exchange="TWSE"),
        EtfProfile(code="0056", name="元大高股息",
                   listing_date=date(2007, 12, 26), exchange="TWSE"),
    ])
    assert db.all_codes() == ["0050", "0056"]


def test_empty_upsert_is_a_noop(db):
    db.upsert_prices([])
    assert db.all_codes() == []


def test_get_profiles_returns_map_keyed_by_code(db):
    db.upsert_profiles([EtfProfile(code="0050", name="元大台灣50",
                                   listing_date=date(2003, 6, 30), exchange="TWSE")])
    profiles = db.get_profiles()
    assert profiles["0050"].name == "元大台灣50"


def test_get_profiles_on_empty_db_returns_empty_map(db):
    assert db.get_profiles() == {}


def test_codes_without_history_finds_codes_with_too_few_rows(db):
    """回補的目標:只有當日一筆資料的代號,需要向 Yahoo 取歷史。"""
    db.upsert_prices([price(code="0050", d=date(2026, 8, 21))])
    db.upsert_prices([price(code="0056", d=date(2026, 8, 19)),
                      price(code="0056", d=date(2026, 8, 20)),
                      price(code="0056", d=date(2026, 8, 21))])
    assert db.codes_without_history(min_rows=3) == ["0050"]


def test_codes_without_history_returns_empty_when_all_have_enough(db):
    db.upsert_prices([price(code="0050", d=date(2026, 8, 19)),
                      price(code="0050", d=date(2026, 8, 20))])
    assert db.codes_without_history(min_rows=2) == []


def test_benchmark_roundtrip_is_idempotent(db):
    rows = [(date(2026, 8, 20), 25000.0), (date(2026, 8, 21), 25100.0)]
    db.upsert_benchmark("TAIEX_TR", rows)
    db.upsert_benchmark("TAIEX_TR", rows)
    got = db.get_benchmark("TAIEX_TR")
    assert got == {date(2026, 8, 20): 25000.0, date(2026, 8, 21): 25100.0}


def test_get_benchmark_returns_empty_map_when_absent(db):
    assert db.get_benchmark("TAIEX_TR") == {}


def test_partial_profile_does_not_erase_fields_it_does_not_know(tmp_path):
    """TWSE 每日行情供應名稱但不供應掛牌日;ETF 靜態清單反之。
    後寫入的那一份若無條件覆寫,真實掛牌日會被抹成 NULL,
    而且是從第二天起才發生 —— 第一天看起來完全正常。"""
    with Database(tmp_path / "t.db") as db:
        db.init_schema()
        # 先寫入靜態清單:有掛牌日、發行人、追蹤指數
        db.upsert_profiles([EtfProfile(
            code="0050", name="元大台灣50", listing_date=date(2003, 6, 30),
            exchange="TWSE", issuer="元大投信", tracking_index="臺灣50指數")])
        # 再寫入每日行情:只有名稱,其餘為 None
        db.upsert_profiles([EtfProfile(
            code="0050", name="元大台灣50", listing_date=None, exchange="TWSE")])

        stored = db.get_profiles()["0050"]
        assert stored.listing_date == date(2003, 6, 30), "掛牌日不得被抹掉"
        assert stored.issuer == "元大投信"
        assert stored.tracking_index == "臺灣50指數"


def test_profile_update_still_overwrites_with_a_real_new_value(tmp_path):
    """保護 None 不代表凍結欄位 —— 有實際新值時仍應更新。"""
    with Database(tmp_path / "t.db") as db:
        db.init_schema()
        db.upsert_profiles([EtfProfile(code="0050", name="舊名稱",
                                       listing_date=date(2003, 6, 30),
                                       exchange="TWSE", issuer="舊發行人")])
        db.upsert_profiles([EtfProfile(code="0050", name="元大台灣50",
                                       listing_date=date(2003, 7, 1),
                                       exchange="TWSE", issuer="元大投信")])
        stored = db.get_profiles()["0050"]
        assert stored.name == "元大台灣50"
        assert stored.listing_date == date(2003, 7, 1)
        assert stored.issuer == "元大投信"


def test_codes_needing_dividends_returns_never_fetched_codes(tmp_path):
    with Database(tmp_path / "t.db") as db:
        db.init_schema()
        db.upsert_prices([PriceRecord(code=c, date=date(2026, 8, 25), open=1.0,
                                      high=1.0, low=1.0, close=1.0, volume=1,
                                      adj_close=1.0)
                          for c in ("0050", "0056", "00878")])
        assert db.codes_needing_dividends(max_age_days=30, today=date(2026, 8, 25)) == \
            ["0050", "0056", "00878"]


def test_recording_a_fetch_stops_it_from_being_returned_again(tmp_path):
    """「沒有配息紀錄」與「還沒抓過」是兩件事 —— 從不配息的 ETF 若靠
    「表裡沒有資料」判斷,會被每天重抓一輩子。"""
    with Database(tmp_path / "t.db") as db:
        db.init_schema()
        db.upsert_prices([PriceRecord(code="0050", date=date(2026, 8, 25), open=1.0,
                                      high=1.0, low=1.0, close=1.0, volume=1,
                                      adj_close=1.0)])
        db.record_dividend_fetch("0050", date(2026, 8, 25))
        assert db.codes_needing_dividends(30, today=date(2026, 8, 25)) == []


def test_a_stale_fetch_comes_back_for_refresh(tmp_path):
    with Database(tmp_path / "t.db") as db:
        db.init_schema()
        db.upsert_prices([PriceRecord(code="0050", date=date(2026, 8, 25), open=1.0,
                                      high=1.0, low=1.0, close=1.0, volume=1,
                                      adj_close=1.0)])
        db.record_dividend_fetch("0050", date(2026, 7, 1))
        assert db.codes_needing_dividends(30, today=date(2026, 8, 25)) == ["0050"]
        assert db.codes_needing_dividends(90, today=date(2026, 8, 25)) == []


def test_recording_a_fetch_twice_updates_rather_than_duplicates(tmp_path):
    with Database(tmp_path / "t.db") as db:
        db.init_schema()
        db.record_dividend_fetch("0050", date(2026, 7, 1))
        db.record_dividend_fetch("0050", date(2026, 8, 25))
        n = db.conn.execute("SELECT COUNT(*) FROM dividend_fetches").fetchone()[0]
        assert n == 1


def test_migration_adds_prev_close_to_an_existing_database(tmp_path):
    """SCHEMA 是 CREATE TABLE IF NOT EXISTS —— 對既有的表完全不生效。

    線上那份資料庫累積了三年歷史,砍掉重建等於永久失去淨值那段
    (淨值來源沒有歷史,補不回來),所以新增欄位必須能就地遷移。
    """
    db_path = tmp_path / "old.db"
    con = sqlite3.connect(db_path)
    con.execute("""CREATE TABLE dividends (
        code TEXT NOT NULL, ex_date TEXT NOT NULL, pay_date TEXT,
        amount REAL NOT NULL, PRIMARY KEY (code, ex_date))""")
    con.execute("INSERT INTO dividends VALUES ('0050','2024-01-17',NULL,3.0)")
    con.commit()
    con.close()

    with Database(db_path) as db:
        db.init_schema()
        rows = db.get_dividends("0050")
        assert len(rows) == 1
        assert rows[0].amount == 3.0
        assert rows[0].prev_close is None
        # 遷移後可以寫入新欄位
        db.upsert_dividends([DividendRecord(
            code="0050", ex_date=date(2024, 1, 17), pay_date=None,
            amount=3.0, prev_close=131.65)])
        assert db.get_dividends("0050")[0].prev_close == 131.65


def test_prev_close_is_not_wiped_by_a_source_that_lacks_it(tmp_path):
    """FinMind 給金額、證交所給前收盤價,兩邊各補一半。

    後寫的那一方不該把前一方補好的欄位清成 NULL(同 ledger R26)。
    """
    with Database(tmp_path / "d.db") as db:
        db.init_schema()
        db.upsert_dividends([DividendRecord(
            code="0050", ex_date=date(2024, 1, 17), pay_date=None,
            amount=3.0, prev_close=131.65)])
        db.upsert_dividends([DividendRecord(
            code="0050", ex_date=date(2024, 1, 17), pay_date=date(2024, 2, 21),
            amount=3.0, prev_close=None)])
        r = db.get_dividends("0050")[0]
        assert r.prev_close == 131.65
        assert r.pay_date == date(2024, 2, 21)
