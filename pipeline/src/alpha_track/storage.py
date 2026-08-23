"""SQLite 儲存層。規格 §3.3、§3.4。

所有寫入使用 INSERT ... ON CONFLICT DO UPDATE,確保冪等:
同一天重跑任意次數,結果一致且不產生重複列。
"""
from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from datetime import date
from pathlib import Path
from types import TracebackType

from .models import DividendRecord, EtfProfile, NavRecord, PriceRecord

SCHEMA = """
CREATE TABLE IF NOT EXISTS etfs (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    listing_date TEXT,
    exchange TEXT NOT NULL,
    category TEXT,
    region TEXT,
    issuer TEXT,
    tracking_index TEXT,
    expense_ratio REAL,
    is_leveraged INTEGER NOT NULL DEFAULT 0,
    is_inverse INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prices (
    code TEXT NOT NULL,
    date TEXT NOT NULL,
    open REAL, high REAL, low REAL,
    close REAL NOT NULL,
    volume INTEGER,
    adj_close REAL NOT NULL,
    PRIMARY KEY (code, date)
);

CREATE TABLE IF NOT EXISTS navs (
    code TEXT NOT NULL,
    date TEXT NOT NULL,
    nav REAL NOT NULL,
    market_price REAL NOT NULL,
    fund_size REAL,
    PRIMARY KEY (code, date)
);

CREATE TABLE IF NOT EXISTS dividends (
    code TEXT NOT NULL,
    ex_date TEXT NOT NULL,
    pay_date TEXT,
    amount REAL NOT NULL,
    PRIMARY KEY (code, ex_date)
);

CREATE TABLE IF NOT EXISTS benchmarks (
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    close REAL NOT NULL,
    PRIMARY KEY (name, date)
);

CREATE INDEX IF NOT EXISTS idx_prices_date ON prices(date);
"""


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row

    def __enter__(self) -> Database:
        return self

    def __exit__(self, exc_type: type[BaseException] | None,
                 exc: BaseException | None, tb: TracebackType | None) -> None:
        self.conn.close()

    def init_schema(self) -> None:
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def upsert_prices(self, records: Iterable[PriceRecord]) -> None:
        rows = [(r.code, r.date.isoformat(), r.open, r.high, r.low,
                 r.close, r.volume, r.adj_close) for r in records]
        if not rows:
            return
        self.conn.executemany(
            """INSERT INTO prices (code, date, open, high, low, close, volume, adj_close)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(code, date) DO UPDATE SET
                 open=excluded.open, high=excluded.high, low=excluded.low,
                 close=excluded.close, volume=excluded.volume,
                 adj_close=excluded.adj_close""",
            rows,
        )
        self.conn.commit()

    def upsert_navs(self, records: Iterable[NavRecord]) -> None:
        rows = [(r.code, r.date.isoformat(), r.nav, r.market_price, r.fund_size)
                for r in records]
        if not rows:
            return
        self.conn.executemany(
            """INSERT INTO navs (code, date, nav, market_price, fund_size)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(code, date) DO UPDATE SET
                 nav=excluded.nav, market_price=excluded.market_price,
                 fund_size=excluded.fund_size""",
            rows,
        )
        self.conn.commit()

    def upsert_dividends(self, records: Iterable[DividendRecord]) -> None:
        rows = [(r.code, r.ex_date.isoformat(),
                 r.pay_date.isoformat() if r.pay_date else None, r.amount)
                for r in records]
        if not rows:
            return
        self.conn.executemany(
            """INSERT INTO dividends (code, ex_date, pay_date, amount)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(code, ex_date) DO UPDATE SET
                 pay_date=excluded.pay_date, amount=excluded.amount""",
            rows,
        )
        self.conn.commit()

    def upsert_profiles(self, profiles: Iterable[EtfProfile]) -> None:
        rows = [(p.code, p.name,
                 p.listing_date.isoformat() if p.listing_date else None,
                 p.exchange, p.category, p.region, p.issuer, p.tracking_index,
                 p.expense_ratio, int(p.is_leveraged), int(p.is_inverse))
                for p in profiles]
        if not rows:
            return
        self.conn.executemany(
            """INSERT INTO etfs (code, name, listing_date, exchange, category,
                                 region, issuer, tracking_index, expense_ratio,
                                 is_leveraged, is_inverse)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(code) DO UPDATE SET
                 name=excluded.name,
                 exchange=excluded.exchange,
                 is_leveraged=excluded.is_leveraged,
                 is_inverse=excluded.is_inverse,
                 -- 以下欄位由不同來源分別供應:每日行情給名稱但不給掛牌日,
                 -- ETF 靜態清單反之。無條件覆寫會讓後寫入的那一份把對方的
                 -- 欄位抹成 NULL —— 而且是從第二天起才發生,第一天完全正常。
                 -- COALESCE 讓「這個來源不知道」不等於「把它清掉」。
                 listing_date=COALESCE(excluded.listing_date, etfs.listing_date),
                 category=COALESCE(excluded.category, etfs.category),
                 region=COALESCE(excluded.region, etfs.region),
                 issuer=COALESCE(excluded.issuer, etfs.issuer),
                 tracking_index=COALESCE(excluded.tracking_index,
                                         etfs.tracking_index),
                 expense_ratio=COALESCE(excluded.expense_ratio,
                                        etfs.expense_ratio)""",
            rows,
        )
        self.conn.commit()

    def get_prices(self, code: str) -> list[PriceRecord]:
        cur = self.conn.execute(
            "SELECT * FROM prices WHERE code = ? ORDER BY date", (code,)
        )
        return [
            PriceRecord(code=r["code"], date=date.fromisoformat(r["date"]),
                        open=r["open"], high=r["high"], low=r["low"],
                        close=r["close"], volume=r["volume"],
                        adj_close=r["adj_close"])
            for r in cur.fetchall()
        ]

    def get_navs(self, code: str) -> list[NavRecord]:
        cur = self.conn.execute(
            "SELECT * FROM navs WHERE code = ? ORDER BY date", (code,)
        )
        return [
            NavRecord(code=r["code"], date=date.fromisoformat(r["date"]),
                      nav=r["nav"], market_price=r["market_price"],
                      fund_size=r["fund_size"])
            for r in cur.fetchall()
        ]

    def get_dividends(self, code: str) -> list[DividendRecord]:
        cur = self.conn.execute(
            "SELECT * FROM dividends WHERE code = ? ORDER BY ex_date", (code,)
        )
        return [
            DividendRecord(
                code=r["code"], ex_date=date.fromisoformat(r["ex_date"]),
                pay_date=date.fromisoformat(r["pay_date"]) if r["pay_date"] else None,
                amount=r["amount"])
            for r in cur.fetchall()
        ]

    def trading_days(self) -> list[date]:
        """全市場交易日曆,由已收錄的價格日期推導。"""
        cur = self.conn.execute("SELECT DISTINCT date FROM prices ORDER BY date")
        return [date.fromisoformat(r["date"]) for r in cur.fetchall()]

    def latest_price_date(self) -> date | None:
        cur = self.conn.execute("SELECT MAX(date) AS d FROM prices")
        row = cur.fetchone()
        return date.fromisoformat(row["d"]) if row and row["d"] else None

    def get_profiles(self) -> dict[str, EtfProfile]:
        cur = self.conn.execute("SELECT * FROM etfs")
        return {
            r["code"]: EtfProfile(
                code=r["code"], name=r["name"],
                listing_date=(date.fromisoformat(r["listing_date"])
                              if r["listing_date"] else None),
                exchange=r["exchange"], category=r["category"], region=r["region"],
                issuer=r["issuer"], tracking_index=r["tracking_index"],
                expense_ratio=r["expense_ratio"],
                is_leveraged=bool(r["is_leveraged"]),
                is_inverse=bool(r["is_inverse"]))
            for r in cur.fetchall()
        }

    def codes_without_history(self, min_rows: int) -> list[str]:
        """價格列數少於 min_rows 的代號 —— 這些需要向 Yahoo 回補歷史。"""
        cur = self.conn.execute(
            "SELECT code FROM prices GROUP BY code HAVING COUNT(*) < ? ORDER BY code",
            (min_rows,),
        )
        return [r["code"] for r in cur.fetchall()]

    def upsert_benchmark(self, name: str, rows: Iterable[tuple[date, float]]) -> None:
        data = [(name, d.isoformat(), c) for d, c in rows]
        if not data:
            return
        self.conn.executemany(
            """INSERT INTO benchmarks (name, date, close) VALUES (?, ?, ?)
               ON CONFLICT(name, date) DO UPDATE SET close=excluded.close""",
            data,
        )
        self.conn.commit()

    def get_benchmark(self, name: str) -> dict[date, float]:
        cur = self.conn.execute(
            "SELECT date, close FROM benchmarks WHERE name = ?", (name,)
        )
        return {date.fromisoformat(r["date"]): r["close"] for r in cur.fetchall()}

    def all_codes(self) -> list[str]:
        cur = self.conn.execute("SELECT code FROM etfs ORDER BY code")
        codes = [r["code"] for r in cur.fetchall()]
        if codes:
            return codes
        cur = self.conn.execute("SELECT DISTINCT code FROM prices ORDER BY code")
        return [r["code"] for r in cur.fetchall()]
