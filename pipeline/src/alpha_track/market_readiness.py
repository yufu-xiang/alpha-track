"""判斷指定台股交易日的官方收盤資料是否已經到齊。

這支程式只用 Python 標準函式庫，讓每小時的 GitHub Actions 檢查不用安裝
整套資料管線。它會把結果寫入 GITHUB_OUTPUT，供 workflow 決定是否啟動更新。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo


TAIPEI = ZoneInfo("Asia/Taipei")
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_META_PATH = REPO_ROOT / "web/public/data/meta.json"

HOLIDAY_URL = "https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule"
TWSE_DAILY_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
TPEX_DAILY_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"

CLOSED_MARKERS = ("放假", "無交易", "休市", "停止交易")
OPEN_MARKERS = ("開始交易", "最後交易")


@dataclass(frozen=True)
class Readiness:
    state: str
    target_date: date
    reason: str


def target_market_date(now: datetime) -> date:
    """17:00 後檢查今天；隔日 00:00–16:59 繼續檢查昨天。"""

    local = now.astimezone(TAIPEI)
    if local.hour >= 17:
        return local.date()
    return local.date() - timedelta(days=1)


def parse_market_date(value: Any) -> date | None:
    """解析 OpenAPI 常見的民國 1150907／115/09/07 與西元日期。"""

    digits = re.sub(r"\D", "", str(value or ""))
    try:
        if len(digits) == 7:
            year = int(digits[:3]) + 1911
            return date(year, int(digits[3:5]), int(digits[5:7]))
        if len(digits) == 8:
            return date(int(digits[:4]), int(digits[4:6]), int(digits[6:8]))
    except ValueError:
        return None
    return None


def latest_payload_date(rows: Iterable[dict[str, Any]]) -> date | None:
    dates = (parse_market_date(row.get("Date")) for row in rows)
    return max((item for item in dates if item is not None), default=None)


def market_closed_reason(target: date, holiday_rows: Iterable[dict[str, Any]]) -> str | None:
    if target.weekday() >= 5:
        return "週末休市"

    for row in holiday_rows:
        if parse_market_date(row.get("Date")) != target:
            continue
        text = f"{row.get('Name', '')} {row.get('Description', '')}"
        # 休假表也會列出「開始交易日」與「最後交易日」，不能誤判成休市。
        if any(marker in text for marker in OPEN_MARKERS):
            return None
        if any(marker in text for marker in CLOSED_MARKERS):
            name = str(row.get("Name") or "國定假日休市")
            return name
    return None


def evaluate_readiness(
    *,
    target: date,
    holiday_rows: Iterable[dict[str, Any]],
    published_date: date | None,
    twse_rows: Iterable[dict[str, Any]],
    tpex_rows: Iterable[dict[str, Any]],
) -> Readiness:
    closed_reason = market_closed_reason(target, holiday_rows)
    if closed_reason:
        return Readiness("closed", target, closed_reason)

    if published_date is not None and published_date >= target:
        return Readiness("already_done", target, f"網站已有 {published_date.isoformat()} 資料")

    twse_date = latest_payload_date(twse_rows)
    tpex_date = latest_payload_date(tpex_rows)
    if twse_date == tpex_date and twse_date is not None:
        if twse_date >= target:
            return Readiness("ready", target, "上市與上櫃官方資料均已到齊")
        # 網站若落後不只一天，17:00 先補上兩個市場共同擁有的最新日期，
        # 後續整點仍會繼續等待目標日，不必讓舊資料多停留一晚。
        if published_date is None or twse_date > published_date:
            return Readiness(
                "ready",
                target,
                f"先補上已到齊的 {twse_date.isoformat()} 資料，再繼續等待目標日",
            )

    return Readiness(
        "pending",
        target,
        f"官方資料尚未到齊（上市 {twse_date or '無日期'}、上櫃 {tpex_date or '無日期'}）",
    )


def fetch_json(url: str) -> Any:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "alpha-track-readiness/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def load_published_date(meta_path: Path) -> date | None:
    if not meta_path.exists():
        return None
    payload = json.loads(meta_path.read_text(encoding="utf-8"))
    value = payload.get("data_date")
    return date.fromisoformat(value) if value else None


def check(now: datetime, meta_path: Path = DEFAULT_META_PATH) -> Readiness:
    target = target_market_date(now)

    # 週末不必呼叫任何外部 API。
    weekend_reason = market_closed_reason(target, [])
    if weekend_reason:
        return Readiness("closed", target, weekend_reason)

    try:
        holidays = fetch_json(HOLIDAY_URL)
    except Exception as error:  # 外部服務暫時失敗時，留待下一個整點重試。
        return Readiness("pending", target, f"休市資料暫時無法讀取（{type(error).__name__}）")
    closed_reason = market_closed_reason(target, holidays)
    if closed_reason:
        return Readiness("closed", target, closed_reason)

    published_date = load_published_date(meta_path)
    if published_date is not None and published_date >= target:
        return Readiness("already_done", target, f"網站已有 {published_date.isoformat()} 資料")

    try:
        twse_rows = fetch_json(TWSE_DAILY_URL)
        tpex_rows = fetch_json(TPEX_DAILY_URL)
    except Exception as error:  # 同上；不要因一次網路中斷誤觸發或留下紅燈。
        return Readiness("pending", target, f"行情資料暫時無法完整讀取（{type(error).__name__}）")

    return evaluate_readiness(
        target=target,
        holiday_rows=holidays,
        published_date=published_date,
        twse_rows=twse_rows,
        tpex_rows=tpex_rows,
    )


def write_github_output(result: Readiness, output_path: str | None) -> None:
    lines = (
        f"state={result.state}\n"
        f"target_date={result.target_date.isoformat()}\n"
        f"reason={result.reason}\n"
    )
    if output_path:
        with Path(output_path).open("a", encoding="utf-8") as output:
            output.write(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--meta", type=Path, default=DEFAULT_META_PATH)
    parser.add_argument(
        "--now",
        help="測試用 ISO 時間；未指定時使用目前時間",
    )
    args = parser.parse_args()

    now = datetime.fromisoformat(args.now) if args.now else datetime.now(TAIPEI)
    result = check(now, args.meta)
    write_github_output(result, os.environ.get("GITHUB_OUTPUT"))
    print(f"{result.state}: {result.target_date.isoformat()} — {result.reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
