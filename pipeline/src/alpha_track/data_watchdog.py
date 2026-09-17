"""從公開網站與官方行情確認每日資料真的已發布。

與每日更新使用不同的排程；更新工作完全沒啟動時也能亮紅燈。
僅使用標準函式庫，避免監控本身依賴整套 pipeline 的安裝狀態。
"""

from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

from alpha_track.market_readiness import (
    DEFAULT_META_PATH,
    TPEX_DAILY_URL,
    TWSE_DAILY_URL,
    latest_payload_date,
    load_published_date,
)

SITE_META_URL = "https://yufu-xiang.github.io/alpha-track/data/meta.json"


def fetch_json(url: str) -> object:
    # 查的是目前正式網站，不應讓 CDN 或代理的舊快取造成假結果。
    parsed = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qsl(parsed.query)
    query.append(("watchdog", str(time.time_ns())))
    fresh_url = urllib.parse.urlunsplit(parsed._replace(
        query=urllib.parse.urlencode(query)))
    request = urllib.request.Request(
        fresh_url,
        headers={"Accept": "application/json", "Cache-Control": "no-cache",
                 "User-Agent": "alpha-track-watchdog/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def validate_dates(
    *, repo_date: date, site_date: date,
    twse_date: date | None, tpex_date: date | None,
) -> list[str]:
    issues = []
    if site_date < repo_date:
        issues.append(f"網站停在 {site_date}，主分支已有 {repo_date}；部署沒有跟上")
    if twse_date is None or tpex_date is None:
        issues.append(f"官方行情日期不可辨識：上市 {twse_date}、上櫃 {tpex_date}")
    elif twse_date == tpex_date and repo_date < twse_date:
        issues.append(f"主分支停在 {repo_date}，兩市場官方行情已到 {twse_date}")
    elif twse_date != tpex_date:
        # 上市、上櫃不同步時無法判定資料已齊；若兩邊都超過主分支，
        # 則無論哪一邊較晚，至少前一個共同交易日已經可以更新。
        common_date = min(twse_date, tpex_date)
        if repo_date < common_date:
            issues.append(f"主分支停在 {repo_date}，兩市場至少已到 {common_date}")
    return issues


def main() -> int:
    repo_date = load_published_date(DEFAULT_META_PATH)
    if repo_date is None:
        print("主分支 meta.json 缺少資料日期", file=sys.stderr)
        return 1

    try:
        site = fetch_json(SITE_META_URL)
        site_date = date.fromisoformat(site["data_date"])
        twse_date = latest_payload_date(fetch_json(TWSE_DAILY_URL))
        tpex_date = latest_payload_date(fetch_json(TPEX_DAILY_URL))
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f"無法驗證網站資料：{error}", file=sys.stderr)
        return 1

    print(f"官方上市 {twse_date}、上櫃 {tpex_date}；主分支 {repo_date}；網站 {site_date}")
    issues = validate_dates(
        repo_date=repo_date, site_date=site_date,
        twse_date=twse_date, tpex_date=tpex_date,
    )
    for issue in issues:
        print(f"::error::{issue}")
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
