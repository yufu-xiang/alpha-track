"""不可回補資料的可攜式復原快照。

GitHub Actions cache 只是加速層，可能被清除。價格、配息與基準可以重新向
來源回補，淨值卻只有當日快照；因此只把 navs 持久化成適合 git delta 的 JSON。
"""
from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path

from .models import NavRecord
from .storage import Database

RECOVERY_VERSION = 1


def build_recovery(db: Database) -> dict:
    return {
        "version": RECOVERY_VERSION,
        "navs": [
            {
                "code": n.code,
                "date": n.date.isoformat(),
                "nav": n.nav,
                "market_price": n.market_price,
                "fund_size": n.fund_size,
            }
            for n in db.get_all_navs()
        ],
    }


def restore_recovery(path: Path, db: Database) -> int:
    """匯入快照並回傳寫入筆數。格式不合法時失敗，不做部分猜測。"""
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or raw.get("version") != RECOVERY_VERSION:
        raise ValueError("不支援的 recovery.json 版本")
    rows = raw.get("navs")
    if not isinstance(rows, list):
        raise ValueError("recovery.json 缺少 navs 陣列")

    parsed: list[NavRecord] = []
    for i, item in enumerate(rows):
        try:
            if not isinstance(item, dict):
                raise TypeError
            code = str(item["code"])
            nav = float(item["nav"])
            market_price = float(item["market_price"])
            fund_size = (float(item["fund_size"])
                         if item.get("fund_size") is not None else None)
            if (not code or not math.isfinite(nav) or nav <= 0
                    or not math.isfinite(market_price) or market_price <= 0
                    or (fund_size is not None
                        and (not math.isfinite(fund_size) or fund_size < 0))):
                raise ValueError
            parsed.append(NavRecord(
                code=code, date=date.fromisoformat(str(item["date"])),
                nav=nav, market_price=market_price, fund_size=fund_size,
            ))
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"recovery.json 的 navs[{i}] 無效") from exc
    db.upsert_navs(parsed)
    return len(parsed)
