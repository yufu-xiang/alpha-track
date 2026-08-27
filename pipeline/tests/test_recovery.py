import json
from datetime import date

import pytest

from alpha_track.models import NavRecord
from alpha_track.recovery import build_recovery, restore_recovery
from alpha_track.storage import Database


def test_recovery_round_trip_preserves_irreplaceable_navs(tmp_path):
    source = tmp_path / "source.db"
    snapshot = tmp_path / "recovery.json"
    with Database(source) as db:
        db.init_schema()
        db.upsert_navs([NavRecord(
            code="0050", date=date(2026, 8, 27), nav=50.0,
            market_price=50.5, fund_size=1_000_000,
        )])
        snapshot.write_text(json.dumps(build_recovery(db)), encoding="utf-8")

    with Database(tmp_path / "restored.db") as db:
        db.init_schema()
        assert restore_recovery(snapshot, db) == 1
        assert restore_recovery(snapshot, db) == 1  # 冪等
        rows = db.get_navs("0050")
        assert len(rows) == 1
        assert rows[0].premium_discount == pytest.approx(0.01)
        assert rows[0].fund_size == 1_000_000


def test_recovery_rejects_an_unknown_version(tmp_path):
    snapshot = tmp_path / "recovery.json"
    snapshot.write_text('{"version":999,"navs":[]}', encoding="utf-8")
    with Database(tmp_path / "restored.db") as db:
        db.init_schema()
        with pytest.raises(ValueError, match="版本"):
            restore_recovery(snapshot, db)


@pytest.mark.parametrize("bad", [
    {"code": "", "date": "2026-08-27", "nav": 50,
     "market_price": 50, "fund_size": None},
    {"code": "0050", "date": "2026-02-30", "nav": 50,
     "market_price": 50, "fund_size": None},
    {"code": "0050", "date": "2026-08-27", "nav": float("nan"),
     "market_price": 50, "fund_size": None},
    {"code": "0050", "date": "2026-08-27", "nav": 50,
     "market_price": 0, "fund_size": None},
])
def test_recovery_rejects_invalid_rows_without_partial_import(tmp_path, bad):
    snapshot = tmp_path / "recovery.json"
    good = {"code": "0056", "date": "2026-08-27", "nav": 40,
            "market_price": 40, "fund_size": None}
    snapshot.write_text(json.dumps({"version": 1, "navs": [good, bad]}),
                        encoding="utf-8")
    with Database(tmp_path / "restored.db") as db:
        db.init_schema()
        with pytest.raises(ValueError, match=r"navs\[1\]"):
            restore_recovery(snapshot, db)
        assert db.get_all_navs() == []
