# 階段 0 + 1a:資料 Pipeline 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立每日自動執行的 Python pipeline,從免費 API 抓取全台股 ETF 資料,計算多期間含息報酬與風險指標,匯出前端可直接消費的 JSON。

**Architecture:** 五階段管線 `fetch → normalize → store → compute → export`。各資料源實作為獨立 adapter,將原始回應映射到固定的正規化型別;因此 API 格式的不確定性只存在於 adapter 層,其餘所有模組都對穩定的內部型別編程。SQLite 為歷史真相來源,匯出的 JSON 為前端的唯一介面。

**Tech Stack:** Python 3.12、`httpx`、`pandas`、`PyYAML`、`pytest`、SQLite(標準庫 `sqlite3`)、GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-21-etf-tracker-design.md`

## Global Constraints

- Python 3.12 以上
- **絕不憑記憶寫死 API endpoint** —— 所有端點與欄位名稱必須來自 Task 1 產出的 `docs/data-sources.md`
- 全流程冪等:同一天重跑任意次數,結果一致且不產生重複列
- 絕不用壞資料覆蓋好資料:驗證未通過時保留前一日資料並標記 stale
- 資料不足一律輸出 `null`,絕不以 `0` 或其他數字頂替
- 所有金額與比率以 `float` 儲存;比率一律用小數(0.0523 表示 5.23%),不用百分比數值
- 期間代碼固定為:`D1 W1 M1 M3 M6 YTD Y1 Y3 Y5 Y10 INCEPTION`
- 時區一律 `Asia/Taipei`
- 測試不得連網;所有解析測試使用 `tests/fixtures/` 下的真實回應快照

## 探索閘門(重要)

**Task 1 是探索任務,其產出會影響後續任務的欄位命名。**

完成 Task 1 後,必須先重讀 Task 8(資料源 adapters),
將其中的欄位映射依 `docs/data-sources.md` 的實測結果修正,再繼續實作。

Task 2–7 與 Task 9–12 對**正規化內部型別**編程,不受 API 格式影響,無須調整。

---

## 檔案結構

```
pipeline/
├── pyproject.toml
├── src/alpha_track/
│   ├── __init__.py
│   ├── models.py            # 正規化資料型別(全專案的穩定介面)
│   ├── periods.py           # 期間起點計算
│   ├── metrics/
│   │   ├── __init__.py
│   │   ├── returns.py       # 含息報酬、CAGR
│   │   └── risk.py          # 波動度、MDD、Sharpe、Beta
│   ├── categories.py        # ETF 分類判定
│   ├── storage.py           # SQLite schema 與冪等寫入
│   ├── validation.py        # 寫入前驗證閘門
│   ├── sources/
│   │   ├── __init__.py
│   │   ├── base.py          # Source protocol
│   │   ├── twse.py
│   │   ├── tpex.py
│   │   ├── yahoo.py
│   │   └── finmind.py
│   ├── compute.py           # 全市場指標計算
│   ├── export.py            # JSON 匯出
│   └── cli.py               # 進入點
└── tests/
    ├── fixtures/            # 真實 API 回應快照
    └── test_*.py

config/
├── etf_categories.yaml
└── settings.yaml

scripts/
└── survey_sources.py        # Task 1 的勘查腳本

.github/workflows/daily.yml
```

---

## Task 1: 資料源勘查(探索閘門)

**Files:**
- Create: `scripts/survey_sources.py`
- Create: `docs/data-sources.md`
- Create: `tests/fixtures/` (存放勘查過程取得的真實回應)

**Interfaces:**
- Consumes: 無
- Produces: `docs/data-sources.md` —— 記錄各來源的可用端點、實際欄位名稱與型別、歷史回溯深度、限流政策。Task 8 的 adapter 實作依賴此文件。

**這個任務沒有 TDD 循環,因為它的產出是事實記錄而非程式邏輯。**

- [ ] **Step 1: 撰寫勘查腳本**

建立 `scripts/survey_sources.py`。腳本對每個候選端點發出一次請求,
印出 HTTP 狀態、回應大小、頂層結構、前兩筆資料的完整欄位,
並把原始回應存到 `tests/fixtures/`。

```python
"""資料源勘查腳本。實際呼叫各免費 API,記錄真實回應結構。

用途:產出 docs/data-sources.md 的事實依據。不進入正式 pipeline。
執行:python scripts/survey_sources.py
"""
import json
import sys
from pathlib import Path

import httpx

FIXTURES = Path(__file__).parent.parent / "pipeline" / "tests" / "fixtures"
FIXTURES.mkdir(parents=True, exist_ok=True)

# 候選端點。這份清單是「待驗證的假設」,不是已知事實。
# 執行後把實際可用的記錄到 docs/data-sources.md,失敗的也要記錄。
CANDIDATES = [
    ("twse_stock_day_all", "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"),
    ("twse_etf_report", "https://openapi.twse.com.tw/v1/ETFReport/ETFRank"),
    ("twse_openapi_index", "https://openapi.twse.com.tw/v1/swagger.json"),
    ("tpex_openapi_index", "https://www.tpex.org.tw/openapi/swagger.json"),
]


def probe(name: str, url: str) -> dict:
    """對單一端點發出請求,回傳勘查結果摘要。"""
    result = {"name": name, "url": url}
    try:
        resp = httpx.get(url, timeout=30.0, follow_redirects=True)
        result["status"] = resp.status_code
        result["content_type"] = resp.headers.get("content-type", "")
        result["bytes"] = len(resp.content)
        if resp.status_code != 200:
            result["error"] = f"HTTP {resp.status_code}"
            return result
        (FIXTURES / f"{name}.json").write_bytes(resp.content)
        data = resp.json()
        if isinstance(data, list):
            result["shape"] = f"list[{len(data)}]"
            result["sample_keys"] = sorted(data[0].keys()) if data else []
            result["samples"] = data[:2]
        elif isinstance(data, dict):
            result["shape"] = "dict"
            result["sample_keys"] = sorted(data.keys())
    except Exception as exc:  # 勘查腳本刻意寬鬆:失敗本身就是要記錄的結果
        result["error"] = f"{type(exc).__name__}: {exc}"
    return result


def main() -> int:
    for name, url in CANDIDATES:
        r = probe(name, url)
        print(json.dumps(r, ensure_ascii=False, indent=2))
        print("-" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: 執行勘查腳本**

Run: `python scripts/survey_sources.py`

預期:每個端點印出一段結果。**部分端點失敗是正常且預期的** ——
`CANDIDATES` 是待驗證的假設。失敗的端點同樣要記錄,以免日後重複嘗試。

- [ ] **Step 3: 依 swagger 索引擴充候選清單並重跑**

若 `twse_openapi_index` 或 `tpex_openapi_index` 成功回傳 swagger,
從中找出與 ETF、淨值、每日行情相關的路徑,加入 `CANDIDATES` 後重新執行,
直到找齊以下四類資料或確認其不可得:

1. 上市 ETF 每日收盤價與成交量
2. ETF 每日淨值與折溢價
3. 上櫃 ETF 每日收盤價
4. 加權報酬指數(注意:是**報酬指數**,非發行量加權股價指數)

- [ ] **Step 4: 驗證 Yahoo 與 FinMind 的可用性**

在勘查腳本中額外測試:

```python
# Yahoo:確認還原股價可得與歷史深度
# 目標:取得 0050.TW 的最早資料日期,以及 close 與 adjclose 是否為不同欄位
YAHOO = ("yahoo_0050",
         "https://query1.finance.yahoo.com/v8/finance/chart/0050.TW"
         "?range=max&interval=1d&events=div")

# FinMind:確認配息 dataset 名稱與免費額度
FINMIND = ("finmind_dividend",
           "https://api.finmindtrade.com/api/v4/data"
           "?dataset=TaiwanStockDividend&data_id=0050&start_date=2015-01-01")
```

把這兩組加入 `CANDIDATES` 重跑。**特別確認 Yahoo 是否同時提供 `close` 與 `adjclose`** ——
含息報酬的整條計算鏈都建立在還原價之上,若沒有還原價,§4.1 的做法必須重新設計,
此時應停下來回報,不要自行改用其他算法。

- [ ] **Step 5: 撰寫 `docs/data-sources.md`**

依實測結果撰寫,結構如下。**只寫實際驗證過的內容,不寫推測。**

```markdown
# 資料源實測記錄

> 本文件記錄實際呼叫結果,是 pipeline adapter 的欄位映射依據。
> 最後驗證日期:YYYY-MM-DD

## 可用端點

### TWSE — 每日收盤行情
- URL: <實際 URL>
- 方法: GET,無需金鑰
- 回應結構: list[dict]
- 欄位:
  | 欄位名 | 型別 | 範例值 | 對應到 |
  |---|---|---|---|
  | Code | str | "0050" | PriceRecord.code |
  | ClosingPrice | str | "195.50" | PriceRecord.close(需轉 float) |
- 注意事項: <實測發現的坑,如數字以字串回傳、空值以 "--" 表示等>

### <其他端點同格式>

## 不可用端點
| 端點 | 失敗原因 | 驗證日期 |
|---|---|---|

## 歷史回溯深度
| 來源 | 最早可得日期 | 驗證方式 |
|---|---|---|

## 限流政策
| 來源 | 實測限制 | 因應方式 |
|---|---|---|

## 對規格的影響
<若實測結果與規格 §3 的假設不符,在此列出,並標記需要修改規格的項目>
```

- [ ] **Step 6: Commit**

```bash
git add scripts/survey_sources.py docs/data-sources.md pipeline/tests/fixtures/
git commit -m "docs: 資料源實測記錄與勘查腳本"
```

- [ ] **Step 7: 檢視對後續任務的影響**

重讀 Task 8,將其欄位映射依 `docs/data-sources.md` 修正。
若 Step 4 發現 Yahoo 無還原價,**停止並回報**,不要自行變更報酬算法。

---

## Task 2: 專案骨架與正規化型別

**Files:**
- Create: `pipeline/pyproject.toml`
- Create: `pipeline/src/alpha_track/__init__.py`
- Create: `pipeline/src/alpha_track/models.py`
- Test: `pipeline/tests/test_models.py`

**Interfaces:**
- Consumes: 無
- Produces: `PriceRecord`、`NavRecord`、`DividendRecord`、`EtfProfile`、`Period` ——
  全專案共用的正規化型別。後續所有任務都對這些型別編程,不直接碰原始 API 格式。

- [ ] **Step 1: 建立 pyproject.toml**

```toml
[project]
name = "alpha-track"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "httpx>=0.27",
    "pandas>=2.2",
    "PyYAML>=6.0",
    "python-dateutil>=2.9",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-cov>=5.0"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/alpha_track"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

- [ ] **Step 2: 寫失敗測試**

建立 `pipeline/tests/test_models.py`:

```python
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
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `cd pipeline && pytest tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'alpha_track.models'`

- [ ] **Step 4: 實作 models.py**

```python
"""正規化資料型別。

這些型別是整個 pipeline 的穩定介面:原始 API 格式的變動被關在 sources/ 的
adapter 層,adapter 負責把任何來源映射到這裡的型別。其餘模組只認識這些型別。
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum


class Period(Enum):
    """績效期間。值同時是 JSON 匯出的鍵,前後端共用,不可任意更動。"""

    D1 = "D1"
    W1 = "W1"
    M1 = "M1"
    M3 = "M3"
    M6 = "M6"
    YTD = "YTD"
    Y1 = "Y1"
    Y3 = "Y3"
    Y5 = "Y5"
    Y10 = "Y10"
    INCEPTION = "INCEPTION"

    @property
    def annualize(self) -> bool:
        """是否應計算年化報酬。規格 §4.2:一年以上才年化。

        將一週報酬年化會產生「年化 380%」這類誤導性數字,故一年以內不年化。
        """
        return self in (Period.Y3, Period.Y5, Period.Y10, Period.INCEPTION)


@dataclass(frozen=True)
class PriceRecord:
    code: str
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: int
    adj_close: float
    """還原權值收盤價。所有報酬計算的基礎(規格 §4.1)。"""

    def __post_init__(self) -> None:
        if self.close <= 0:
            raise ValueError(f"close 必須為正數,得到 {self.close}")
        if self.adj_close <= 0:
            raise ValueError(f"adj_close 必須為正數,得到 {self.adj_close}")


@dataclass(frozen=True)
class NavRecord:
    code: str
    date: date
    nav: float
    market_price: float
    fund_size: float | None = None

    @property
    def premium_discount(self) -> float | None:
        """折溢價率。淨值為零或負數時回傳 None,不回傳 0 —— 兩者意義不同。"""
        if self.nav <= 0:
            return None
        return (self.market_price - self.nav) / self.nav


@dataclass(frozen=True)
class DividendRecord:
    code: str
    ex_date: date
    pay_date: date | None
    amount: float


@dataclass(frozen=True)
class EtfProfile:
    code: str
    name: str
    listing_date: date | None
    exchange: str
    """TWSE 或 TPEx。"""
    category: str | None = None
    region: str | None = None
    issuer: str | None = None
    tracking_index: str | None = None
    expense_ratio: float | None = None
    is_leveraged: bool = False
    is_inverse: bool = False
```

- [ ] **Step 5: 執行測試確認通過**

Run: `cd pipeline && pytest tests/test_models.py -v`
Expected: 8 passed

- [ ] **Step 6: Commit**

```bash
git add pipeline/
git commit -m "feat: 正規化資料型別與專案骨架"
```

---

## Task 3: 期間起點計算

**Files:**
- Create: `pipeline/src/alpha_track/periods.py`
- Test: `pipeline/tests/test_periods.py`

**Interfaces:**
- Consumes: `Period` (Task 2)
- Produces: `period_start(base: date, period: Period, trading_days: Sequence[date]) -> date | None`
  —— 回傳該期間的起點交易日;交易日曆涵蓋不到該期間時回傳 `None`(代表資料不足)。

**設計要點:** 規格 §4.2 規定用**日曆日**往回推,再取當天或之前最近的交易日。
測試使用合成的交易日清單,不依賴真實日曆,結果才可重現。

- [ ] **Step 1: 寫失敗測試**

```python
from datetime import date, timedelta

import pytest

from alpha_track.models import Period
from alpha_track.periods import period_start


def make_trading_days(start: date, end: date) -> list[date]:
    """合成交易日:週一至週五。測試不依賴真實台股行事曆,結果才可重現。"""
    days, cur = [], start
    while cur <= end:
        if cur.weekday() < 5:
            days.append(cur)
        cur += timedelta(days=1)
    return days


DAYS = make_trading_days(date(2014, 1, 1), date(2026, 8, 21))
BASE = date(2026, 8, 21)  # 週五


def test_d1_returns_previous_trading_day():
    assert period_start(BASE, Period.D1, DAYS) == date(2026, 8, 20)


def test_d1_skips_weekend():
    monday = date(2026, 8, 24)
    assert period_start(monday, Period.D1, DAYS) == date(2026, 8, 21)


def test_w1_goes_back_seven_calendar_days():
    assert period_start(BASE, Period.W1, DAYS) == date(2026, 8, 14)


def test_m1_goes_back_one_calendar_month():
    assert period_start(BASE, Period.M1, DAYS) == date(2026, 7, 21)


def test_y1_lands_on_or_before_target_when_target_is_not_a_trading_day():
    """2025-08-21 是週四(交易日),取當天。"""
    assert period_start(BASE, Period.Y1, DAYS) == date(2025, 8, 21)


def test_falls_back_to_earlier_trading_day_when_target_is_weekend():
    """回推的目標日落在週末時,取「之前」最近的交易日,不是之後。

    自 2026-08-17(週一)回推一週 = 2026-08-10(週一,交易日),
    故改以 2026-08-16(週日)為目標的情境測試:
    自 2026-08-23(週日)回推一週 = 2026-08-16(週日,非交易日),
    應回退至 2026-08-14(週五)。
    """
    assert period_start(date(2026, 8, 23), Period.W1, DAYS) == date(2026, 8, 14)


def test_never_falls_forward_past_the_target():
    """回退方向必須向前(較早),向後取會讓期間短於宣稱的長度,
    使報酬率被系統性高估或低估。"""
    result = period_start(date(2026, 8, 23), Period.W1, DAYS)
    assert result is not None and result <= date(2026, 8, 16)


def test_ytd_returns_first_trading_day_of_year():
    assert period_start(BASE, Period.YTD, DAYS) == date(2026, 1, 1)


def test_inception_returns_first_available_trading_day():
    assert period_start(BASE, Period.INCEPTION, DAYS) == DAYS[0]


def test_returns_none_when_history_is_too_short():
    """規格 §4.3:資料不足回傳 None,絕不以最早日期頂替。"""
    short = make_trading_days(date(2025, 1, 1), date(2026, 8, 21))
    assert period_start(BASE, Period.Y10, short) is None


def test_returns_none_for_empty_trading_days():
    assert period_start(BASE, Period.Y1, []) is None


def test_base_date_itself_may_be_the_start_for_inception_of_one_day_history():
    single = [BASE]
    assert period_start(BASE, Period.INCEPTION, single) == BASE
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd pipeline && pytest tests/test_periods.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'alpha_track.periods'`

- [ ] **Step 3: 實作 periods.py**

```python
"""期間起點計算。

規格 §4.2:用日曆日往回推,取當天或之前最近的交易日。
不用交易日數的原因:各檔 ETF 停牌與掛牌日不同,用交易日數會使比較區間對不齊。
"""
from __future__ import annotations

import bisect
from collections.abc import Sequence
from datetime import date

from dateutil.relativedelta import relativedelta

from .models import Period

_CALENDAR_OFFSET = {
    Period.W1: relativedelta(days=7),
    Period.M1: relativedelta(months=1),
    Period.M3: relativedelta(months=3),
    Period.M6: relativedelta(months=6),
    Period.Y1: relativedelta(years=1),
    Period.Y3: relativedelta(years=3),
    Period.Y5: relativedelta(years=5),
    Period.Y10: relativedelta(years=10),
}


def period_start(
    base: date, period: Period, trading_days: Sequence[date]
) -> date | None:
    """回傳期間起點的交易日,資料不足時回傳 None。

    trading_days 須為已排序的交易日清單。回傳 None 代表該 ETF 的歷史
    不足以涵蓋此期間 —— 呼叫端應輸出 null 並將其排除於該期間排名之外。
    """
    if not trading_days:
        return None

    if period is Period.INCEPTION:
        return trading_days[0]

    if period is Period.D1:
        idx = bisect.bisect_left(trading_days, base)
        return trading_days[idx - 1] if idx >= 1 else None

    if period is Period.YTD:
        target = date(base.year, 1, 1)
        idx = bisect.bisect_left(trading_days, target)
        return trading_days[idx] if idx < len(trading_days) else None

    target = base - _CALENDAR_OFFSET[period]
    if target < trading_days[0]:
        return None
    # 取「當天或之前」最近的交易日
    idx = bisect.bisect_right(trading_days, target)
    return trading_days[idx - 1] if idx >= 1 else None
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd pipeline && pytest tests/test_periods.py -v`
Expected: 12 passed

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/alpha_track/periods.py pipeline/tests/test_periods.py
git commit -m "feat: 期間起點計算,資料不足回傳 None"
```

---

## Task 4: 報酬計算

**Files:**
- Create: `pipeline/src/alpha_track/metrics/__init__.py`
- Create: `pipeline/src/alpha_track/metrics/returns.py`
- Test: `pipeline/tests/test_returns.py`

**Interfaces:**
- Consumes: 無
- Produces:
  - `total_return(start_adj: float, end_adj: float) -> float`
  - `cagr(total_ret: float, years: float) -> float | None`
  - `years_between(start: date, end: date) -> float`

- [ ] **Step 1: 寫失敗測試**

```python
from datetime import date

import pytest

from alpha_track.metrics.returns import cagr, total_return, years_between


def test_total_return_uses_adjusted_prices():
    """規格 §4.1:含息報酬 = 期末還原價 / 期初還原價 - 1。"""
    assert total_return(100.0, 120.0) == pytest.approx(0.20)


def test_total_return_handles_loss():
    assert total_return(100.0, 75.0) == pytest.approx(-0.25)


def test_total_return_rejects_non_positive_start():
    with pytest.raises(ValueError, match="起始還原價必須為正數"):
        total_return(0.0, 120.0)


def test_years_between_uses_actual_day_count():
    assert years_between(date(2025, 8, 21), date(2026, 8, 21)) == pytest.approx(
        365 / 365.25, rel=1e-3
    )


def test_cagr_of_one_year_equals_total_return():
    assert cagr(0.20, 1.0) == pytest.approx(0.20)


def test_cagr_compounds_over_multiple_years():
    """三年翻倍 → 年化約 25.99%。"""
    assert cagr(1.0, 3.0) == pytest.approx(0.259921, rel=1e-5)


def test_cagr_returns_none_for_zero_or_negative_years():
    assert cagr(0.20, 0.0) is None
    assert cagr(0.20, -1.0) is None


def test_cagr_of_total_loss_is_negative_one():
    """資產歸零:年化報酬為 -100%,不論期間長短。"""
    assert cagr(-1.0, 5.0) == pytest.approx(-1.0)


def test_cagr_returns_none_when_value_goes_below_zero():
    """總報酬低於 -100% 在數學上無法年化(負數開根號),回傳 None 而非 NaN。"""
    assert cagr(-1.5, 3.0) is None
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd pipeline && pytest tests/test_returns.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 實作**

建立空的 `pipeline/src/alpha_track/metrics/__init__.py`,以及:

```python
"""報酬計算。規格 §4.1、§4.2。"""
from __future__ import annotations

from datetime import date

DAYS_PER_YEAR = 365.25
"""含閏年的平均日數。用於把日數換算成年數。"""


def total_return(start_adj: float, end_adj: float) -> float:
    """含息總報酬。以還原權值價計算,除息跳空已被還原價吸收。"""
    if start_adj <= 0:
        raise ValueError(f"起始還原價必須為正數,得到 {start_adj}")
    return end_adj / start_adj - 1.0


def years_between(start: date, end: date) -> float:
    return (end - start).days / DAYS_PER_YEAR


def cagr(total_ret: float, years: float) -> float | None:
    """年化複合報酬率。無法計算時回傳 None,絕不回傳 NaN 或 0。

    回傳 None 的情況:
    - years <= 0:期間無效
    - total_ret < -1:總報酬低於 -100%,負數開根號無實數解
    """
    if years <= 0:
        return None
    if total_ret < -1.0:
        return None
    if total_ret == -1.0:
        return -1.0
    return (1.0 + total_ret) ** (1.0 / years) - 1.0
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd pipeline && pytest tests/test_returns.py -v`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/alpha_track/metrics/ pipeline/tests/test_returns.py
git commit -m "feat: 含息報酬與 CAGR 計算"
```

---

## Task 5: 風險指標

**Files:**
- Create: `pipeline/src/alpha_track/metrics/risk.py`
- Test: `pipeline/tests/test_risk.py`

**Interfaces:**
- Consumes: 無
- Produces:
  - `daily_returns(adj_closes: Sequence[float]) -> list[float]`
  - `annualized_volatility(rets: Sequence[float]) -> float | None`
  - `max_drawdown(adj_closes: Sequence[float]) -> float | None`
  - `sharpe(annual_return: float, annual_vol: float | None, risk_free: float) -> float | None`
  - `beta(asset_rets: Sequence[float], bench_rets: Sequence[float]) -> float | None`

- [ ] **Step 1: 寫失敗測試**

```python
import pytest

from alpha_track.metrics.risk import (
    annualized_volatility,
    beta,
    daily_returns,
    max_drawdown,
    sharpe,
)


def test_daily_returns_computes_successive_changes():
    assert daily_returns([100.0, 110.0, 99.0]) == pytest.approx([0.10, -0.10])


def test_daily_returns_of_single_price_is_empty():
    assert daily_returns([100.0]) == []


def test_annualized_volatility_of_known_series():
    """[+1%, -1%, +1%, -1%] 的樣本標準差 × sqrt(252)。手算值 0.183306。"""
    rets = [0.01, -0.01, 0.01, -0.01]
    assert annualized_volatility(rets) == pytest.approx(0.183306, rel=1e-4)


def test_volatility_of_constant_prices_is_zero():
    assert annualized_volatility(daily_returns([50.0] * 30)) == pytest.approx(0.0)


def test_volatility_needs_at_least_two_returns():
    assert annualized_volatility([0.01]) is None
    assert annualized_volatility([]) is None


def test_max_drawdown_finds_worst_peak_to_trough():
    """峰 120 → 谷 90,回撤 -25%。後續漲到 150 不影響歷史最大回撤。"""
    assert max_drawdown([100.0, 120.0, 90.0, 150.0]) == pytest.approx(-0.25)


def test_max_drawdown_of_monotonic_rise_is_zero():
    assert max_drawdown([100.0, 110.0, 120.0]) == pytest.approx(0.0)


def test_max_drawdown_uses_earlier_peak_not_later_one():
    """先跌 50% 再創新高後小跌,最大回撤仍是最初那次 -50%。"""
    assert max_drawdown([100.0, 50.0, 200.0, 180.0]) == pytest.approx(-0.50)


def test_max_drawdown_of_empty_series_is_none():
    assert max_drawdown([]) is None


def test_sharpe_divides_excess_return_by_volatility():
    assert sharpe(0.115, 0.20, 0.015) == pytest.approx(0.50)


def test_sharpe_is_none_when_volatility_is_zero():
    """波動為零時 Sharpe 無定義。回傳 None 而非 inf —— inf 會汙染排序。"""
    assert sharpe(0.10, 0.0, 0.015) is None


def test_sharpe_is_none_when_volatility_is_none():
    assert sharpe(0.10, None, 0.015) is None


def test_beta_of_identical_series_is_one():
    rets = [0.01, -0.02, 0.015, 0.003, -0.008]
    assert beta(rets, rets) == pytest.approx(1.0)


def test_beta_of_double_amplitude_series_is_two():
    bench = [0.01, -0.02, 0.015, 0.003, -0.008]
    asset = [r * 2 for r in bench]
    assert beta(asset, bench) == pytest.approx(2.0)


def test_beta_is_none_when_benchmark_has_no_variance():
    assert beta([0.01, 0.02], [0.0, 0.0]) is None


def test_beta_is_none_on_length_mismatch():
    """長度不一致代表資料對齊出錯,回傳 None 而非默默截斷。"""
    assert beta([0.01, 0.02, 0.03], [0.01, 0.02]) is None
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd pipeline && pytest tests/test_risk.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 實作 risk.py**

```python
"""風險指標。規格 §4.4。

共同原則:無法計算時一律回傳 None,絕不回傳 0、inf 或 NaN。
這些值會混入排序與 JSON 輸出,使「無資料」被誤讀為「數值為零」。
"""
from __future__ import annotations

import math
from collections.abc import Sequence

TRADING_DAYS_PER_YEAR = 252


def daily_returns(adj_closes: Sequence[float]) -> list[float]:
    """相鄰交易日的還原價變動率。"""
    return [
        adj_closes[i] / adj_closes[i - 1] - 1.0 for i in range(1, len(adj_closes))
    ]


def annualized_volatility(rets: Sequence[float]) -> float | None:
    """年化波動度 = 日報酬樣本標準差 × sqrt(252)。"""
    n = len(rets)
    if n < 2:
        return None
    mean = sum(rets) / n
    variance = sum((r - mean) ** 2 for r in rets) / (n - 1)
    return math.sqrt(variance) * math.sqrt(TRADING_DAYS_PER_YEAR)


def max_drawdown(adj_closes: Sequence[float]) -> float | None:
    """最大回撤,回傳負值(如 -0.25 表示最深跌掉 25%)。"""
    if not adj_closes:
        return None
    peak = adj_closes[0]
    worst = 0.0
    for price in adj_closes:
        peak = max(peak, price)
        if peak > 0:
            worst = min(worst, price / peak - 1.0)
    return worst


def sharpe(
    annual_return: float, annual_vol: float | None, risk_free: float
) -> float | None:
    """夏普值 = (年化報酬 - 無風險利率) / 年化波動度。

    波動度為零或未知時無定義,回傳 None。
    """
    if annual_vol is None or annual_vol == 0:
        return None
    return (annual_return - risk_free) / annual_vol


def beta(
    asset_rets: Sequence[float], bench_rets: Sequence[float]
) -> float | None:
    """相對大盤的 Beta = Cov(資產, 大盤) / Var(大盤)。

    長度不一致代表日期對齊出錯,回傳 None 而非默默截斷 —— 錯位的
    報酬序列會算出看似合理但完全錯誤的 Beta。
    """
    n = len(asset_rets)
    if n != len(bench_rets) or n < 2:
        return None
    a_mean = sum(asset_rets) / n
    b_mean = sum(bench_rets) / n
    cov = sum((a - a_mean) * (b - b_mean) for a, b in zip(asset_rets, bench_rets))
    var = sum((b - b_mean) ** 2 for b in bench_rets)
    if var == 0:
        return None
    return cov / var
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd pipeline && pytest tests/test_risk.py -v`
Expected: 16 passed

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/alpha_track/metrics/risk.py pipeline/tests/test_risk.py
git commit -m "feat: 波動度、最大回撤、Sharpe、Beta"
```

---

## Task 6: ETF 分類判定

**Files:**
- Create: `pipeline/src/alpha_track/categories.py`
- Create: `config/etf_categories.yaml`
- Test: `pipeline/tests/test_categories.py`

**Interfaces:**
- Consumes: 無
- Produces:
  - `load_category_map(path: Path) -> dict[str, dict]`
  - `classify(code: str, category_map: dict) -> Classification`
  - `Classification` dataclass:`category`、`region`、`is_leveraged`、`is_inverse`

- [ ] **Step 1: 寫失敗測試**

```python
from pathlib import Path

from alpha_track.categories import Classification, classify, load_category_map

CATEGORY_MAP = {
    "0050": {"name": "元大台灣50", "category": "市值型", "region": "台灣"},
    "0056": {"name": "元大高股息", "category": "高股息", "region": "台灣"},
    "00662": {"name": "富邦NASDAQ", "category": "海外指數", "region": "美國"},
}


def test_suffix_b_is_bond_regardless_of_map():
    """代號結尾字母為官方規範,屬確定性規則,優先於人工對照表。"""
    c = classify("00679B", CATEGORY_MAP)
    assert c.category == "債券型"
    assert c.is_leveraged is False


def test_suffix_l_is_leveraged():
    c = classify("00631L", CATEGORY_MAP)
    assert c.category == "槓桿型"
    assert c.is_leveraged is True
    assert c.is_inverse is False


def test_suffix_r_is_inverse():
    c = classify("00632R", CATEGORY_MAP)
    assert c.category == "反向型"
    assert c.is_inverse is True
    assert c.is_leveraged is False


def test_known_code_uses_manual_map():
    c = classify("0050", CATEGORY_MAP)
    assert c.category == "市值型"
    assert c.region == "台灣"


def test_unknown_code_falls_back_to_unclassified():
    """規格 §3.2:未分類不使 pipeline 失敗,照常出現在總排行。"""
    c = classify("00999", CATEGORY_MAP)
    assert c.category == "未分類"
    assert c.region is None


def test_lowercase_suffix_is_handled():
    assert classify("00679b", CATEGORY_MAP).category == "債券型"


def test_load_category_map_reads_yaml(tmp_path: Path):
    f = tmp_path / "cats.yaml"
    f.write_text(
        "0050:\n"
        "  name: 元大台灣50\n"
        "  category: 市值型\n"
        "  region: 台灣\n",
        encoding="utf-8",
    )
    m = load_category_map(f)
    assert m["0050"]["category"] == "市值型"


def test_load_category_map_coerces_keys_to_string(tmp_path: Path):
    """YAML 會把 0050 解析成整數 50,必須還原為字串代號。"""
    f = tmp_path / "cats.yaml"
    f.write_text("0050:\n  category: 市值型\n", encoding="utf-8")
    m = load_category_map(f)
    assert "0050" in m


def test_classification_is_a_dataclass_with_expected_fields():
    c = Classification(category="市值型", region="台灣",
                       is_leveraged=False, is_inverse=False)
    assert c.category == "市值型"
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd pipeline && pytest tests/test_categories.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 實作 categories.py**

```python
"""ETF 分類判定。規格 §3.2。

兩層策略:
1. 代號結尾字母為官方規範(B/L/R),屬確定性規則,寫在程式裡
2. 其餘由人工維護的 config/etf_categories.yaml 決定

刻意不使用名稱關鍵字推測:00713「元大台灣高息低波」名稱含「高息」但實為
低波動因子型,猜錯會直接汙染排行榜的可信度。
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

UNCLASSIFIED = "未分類"


@dataclass(frozen=True)
class Classification:
    category: str
    region: str | None
    is_leveraged: bool
    is_inverse: bool


def load_category_map(path: Path) -> dict[str, dict]:
    """讀取人工分類表。

    YAML 會把 0050 這種前導零數字解析成整數,必須還原成四到六位數字串。
    """
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    result: dict[str, dict] = {}
    for key, value in raw.items():
        code = str(key) if isinstance(key, str) else f"{int(key):04d}"
        result[code] = value or {}
    return result


def classify(code: str, category_map: dict[str, dict]) -> Classification:
    """判定單一 ETF 的分類。未知代號歸「未分類」,不拋出例外。"""
    suffix = code[-1].upper() if code else ""

    if suffix == "B":
        return Classification("債券型", None, False, False)
    if suffix == "L":
        return Classification("槓桿型", None, True, False)
    if suffix == "R":
        return Classification("反向型", None, False, True)

    entry = category_map.get(code)
    if entry is None:
        return Classification(UNCLASSIFIED, None, False, False)
    return Classification(
        category=entry.get("category", UNCLASSIFIED),
        region=entry.get("region"),
        is_leveraged=False,
        is_inverse=False,
    )
```

- [ ] **Step 4: 建立初始分類表**

建立 `config/etf_categories.yaml`。先填入已確認的主要標的,
其餘由 pipeline 的未分類報告逐步補齊:

```yaml
# ETF 分類對照表(規格 §3.2)
#
# 代號結尾 B/L/R 由程式判定,不需列在此處。
# pipeline 每次執行會在 run report 列出未分類代號,補行即可。
#
# category 可用值:市值型 / 高股息 / 主題型 / 海外指數 / 產業型 / 因子型
0050:   { name: 元大台灣50,         category: 市值型,   region: 台灣 }
0051:   { name: 元大中型100,        category: 市值型,   region: 台灣 }
0056:   { name: 元大高股息,         category: 高股息,   region: 台灣 }
006208: { name: 富邦台50,           category: 市值型,   region: 台灣 }
00662:  { name: 富邦NASDAQ,         category: 海外指數, region: 美國 }
00713:  { name: 元大台灣高息低波,   category: 因子型,   region: 台灣 }
00878:  { name: 國泰永續高股息,     category: 高股息,   region: 台灣 }
00919:  { name: 群益台灣精選高息,   category: 高股息,   region: 台灣 }
00929:  { name: 復華台灣科技優息,   category: 高股息,   region: 台灣 }
```

- [ ] **Step 5: 執行測試確認通過**

Run: `cd pipeline && pytest tests/test_categories.py -v`
Expected: 9 passed

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/alpha_track/categories.py pipeline/tests/test_categories.py config/etf_categories.yaml
git commit -m "feat: ETF 分類判定,代號規則優先於人工對照表"
```

---

## Task 7: SQLite 儲存與冪等寫入

**Files:**
- Create: `pipeline/src/alpha_track/storage.py`
- Test: `pipeline/tests/test_storage.py`

**Interfaces:**
- Consumes: `PriceRecord`、`NavRecord`、`DividendRecord`、`EtfProfile` (Task 2)
- Produces:
  - `Database(path: Path)` —— context manager
  - `.init_schema()`、`.upsert_prices(records)`、`.upsert_navs(records)`、
    `.upsert_dividends(records)`、`.upsert_profiles(profiles)`
  - `.get_prices(code) -> list[PriceRecord]`、`.trading_days() -> list[date]`
  - `.latest_price_date() -> date | None`、`.all_codes() -> list[str]`

- [ ] **Step 1: 寫失敗測試**

```python
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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd pipeline && pytest tests/test_storage.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 實作 storage.py**

```python
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
                 name=excluded.name, listing_date=excluded.listing_date,
                 exchange=excluded.exchange, category=excluded.category,
                 region=excluded.region, issuer=excluded.issuer,
                 tracking_index=excluded.tracking_index,
                 expense_ratio=excluded.expense_ratio,
                 is_leveraged=excluded.is_leveraged,
                 is_inverse=excluded.is_inverse""",
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

    def all_codes(self) -> list[str]:
        cur = self.conn.execute("SELECT code FROM etfs ORDER BY code")
        codes = [r["code"] for r in cur.fetchall()]
        if codes:
            return codes
        cur = self.conn.execute("SELECT DISTINCT code FROM prices ORDER BY code")
        return [r["code"] for r in cur.fetchall()]
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd pipeline && pytest tests/test_storage.py -v`
Expected: 11 passed

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/alpha_track/storage.py pipeline/tests/test_storage.py
git commit -m "feat: SQLite 儲存層,全數寫入為冪等 upsert"
```

---

## Task 8: 驗證閘門

**Files:**
- Create: `pipeline/src/alpha_track/validation.py`
- Test: `pipeline/tests/test_validation.py`

**Interfaces:**
- Consumes: `PriceRecord`、`NavRecord`、`DividendRecord` (Task 2)
- Produces:
  - `ValidationResult` dataclass:`accepted`、`flagged`、`batch_rejected`、`batch_reason`
  - `validate_price_batch(records, previous_count, previous_closes, dividend_ex_dates) -> ValidationResult`

- [ ] **Step 1: 寫失敗測試**

```python
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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd pipeline && pytest tests/test_validation.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 實作 validation.py**

```python
"""寫入前驗證閘門。規格 §8.1。

核心原則:絕不用壞資料覆蓋好資料。
整批被拒時,呼叫端應保留前一日資料並將 meta 標記為 stale ——
寧可顯示昨天的正確數字,也不要顯示今天的錯誤數字。
"""
from __future__ import annotations

from collections.abc import Collection, Sequence
from dataclasses import dataclass, field
from datetime import date

from .models import PriceRecord

COUNT_DROP_TOLERANCE = 0.10
"""檔數較前一日減少超過此比例即整批拒絕。"""

LARGE_MOVE_THRESHOLD = 0.15
"""單日漲跌幅超過此值且當日無除息,標記為異常。"""


@dataclass
class ValidationResult:
    accepted: list[PriceRecord] = field(default_factory=list)
    flagged: list[tuple[str, str]] = field(default_factory=list)
    """(代號, 原因)。已寫入但需人工檢查。"""
    batch_rejected: bool = False
    batch_reason: str | None = None


def validate_price_batch(
    records: Sequence[PriceRecord],
    previous_count: int,
    previous_closes: dict[str, float],
    dividend_ex_dates: Collection[tuple[str, date]],
) -> ValidationResult:
    """驗證單日價格批次。

    previous_count 為 0 代表首次執行,此時不做檔數比對。
    """
    result = ValidationResult()

    if previous_count > 0:
        threshold = previous_count * (1 - COUNT_DROP_TOLERANCE)
        if len(records) < threshold:
            result.batch_rejected = True
            result.batch_reason = (
                f"檔數自 {previous_count} 降為 {len(records)},"
                f"減幅超過 {COUNT_DROP_TOLERANCE:.0%},疑似 API 格式變更"
            )
            return result

    ex_dates = set(dividend_ex_dates)
    for r in records:
        prev = previous_closes.get(r.code)
        if prev is not None and prev > 0:
            change = r.close / prev - 1.0
            if abs(change) > LARGE_MOVE_THRESHOLD and (r.code, r.date) not in ex_dates:
                result.flagged.append((
                    r.code,
                    f"單日變動 {change:+.1%} 超過門檻但當日無除息紀錄",
                ))
        result.accepted.append(r)

    return result
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd pipeline && pytest tests/test_validation.py -v`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/alpha_track/validation.py pipeline/tests/test_validation.py
git commit -m "feat: 寫入前驗證閘門,壞資料不覆蓋好資料"
```

---

## Task 9: 資料源 adapters

**Files:**
- Create: `pipeline/src/alpha_track/sources/__init__.py`
- Create: `pipeline/src/alpha_track/sources/base.py`
- Create: `pipeline/src/alpha_track/sources/twse.py`
- Create: `pipeline/src/alpha_track/sources/yahoo.py`
- Create: `pipeline/src/alpha_track/sources/finmind.py`
- Test: `pipeline/tests/test_sources.py`

**Interfaces:**
- Consumes: `PriceRecord`、`NavRecord`、`DividendRecord`、`EtfProfile` (Task 2);
  `docs/data-sources.md` (Task 1)
- Produces:
  - `parse_twse_daily(payload: list[dict]) -> list[PriceRecord]`
  - `parse_twse_nav(payload: list[dict]) -> list[NavRecord]`
  - `parse_yahoo_chart(payload: dict, code: str) -> list[PriceRecord]`
  - `parse_finmind_dividends(payload: dict) -> list[DividendRecord]`
  - `fetch_json(url: str, *, retries: int = 3) -> object`

> **依賴 Task 1 的產出。** 下列欄位名稱是**待替換的樣板**。
> 開始實作前,先讀 `docs/data-sources.md`,把每個 adapter 的欄位映射
> 換成實測記錄的真實欄位名。測試 fixture 使用 Task 1 存下的真實回應。

- [ ] **Step 1: 寫失敗測試**

解析函式全部是純函式,測試不連網,只吃 Task 1 存下的 fixture。

```python
import json
from datetime import date
from pathlib import Path

import pytest

from alpha_track.sources.twse import parse_twse_daily
from alpha_track.sources.yahoo import parse_yahoo_chart

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_twse_daily_converts_string_numbers_to_float():
    """TWSE 以字串回傳數字,且含千分位逗號。"""
    payload = [{
        "Code": "0050", "Name": "元大台灣50",
        "OpeningPrice": "194.00", "HighestPrice": "196.00",
        "LowestPrice": "193.50", "ClosingPrice": "195.50",
        "TradeVolume": "12,345,678",
    }]
    rows = parse_twse_daily(payload, trade_date=date(2026, 8, 21))
    assert len(rows) == 1
    assert rows[0].close == 195.5
    assert rows[0].volume == 12345678


def test_parse_twse_daily_skips_rows_with_no_trade():
    """無成交當日以 '--' 表示,略過而非寫入零價。"""
    payload = [
        {"Code": "0050", "Name": "元大台灣50", "OpeningPrice": "194.00",
         "HighestPrice": "196.00", "LowestPrice": "193.50",
         "ClosingPrice": "195.50", "TradeVolume": "1000"},
        {"Code": "00999", "Name": "無成交", "OpeningPrice": "--",
         "HighestPrice": "--", "LowestPrice": "--",
         "ClosingPrice": "--", "TradeVolume": "0"},
    ]
    rows = parse_twse_daily(payload, trade_date=date(2026, 8, 21))
    assert [r.code for r in rows] == ["0050"]


def test_parse_twse_daily_on_empty_payload_returns_empty():
    assert parse_twse_daily([], trade_date=date(2026, 8, 21)) == []


def test_parse_yahoo_chart_prefers_adjclose_over_close():
    """含息報酬的整條鏈路建立在還原價上,必須取 adjclose。"""
    payload = {
        "chart": {"result": [{
            "timestamp": [1755734400, 1755820800],
            "indicators": {
                "quote": [{"open": [100.0, 101.0], "high": [102.0, 103.0],
                           "low": [99.0, 100.0], "close": [101.0, 102.0],
                           "volume": [1000, 2000]}],
                "adjclose": [{"adjclose": [95.0, 96.0]}],
            },
        }]}
    }
    rows = parse_yahoo_chart(payload, code="0050")
    assert len(rows) == 2
    assert rows[0].close == 101.0
    assert rows[0].adj_close == 95.0


def test_parse_yahoo_chart_skips_null_entries():
    """Yahoo 在停牌日回傳 null,必須略過而非當成 0。"""
    payload = {
        "chart": {"result": [{
            "timestamp": [1755734400, 1755820800],
            "indicators": {
                "quote": [{"open": [100.0, None], "high": [102.0, None],
                           "low": [99.0, None], "close": [101.0, None],
                           "volume": [1000, None]}],
                "adjclose": [{"adjclose": [95.0, None]}],
            },
        }]}
    }
    rows = parse_yahoo_chart(payload, code="0050")
    assert len(rows) == 1


def test_parse_yahoo_chart_falls_back_to_close_when_no_adjclose():
    """若來源未提供還原價,以收盤價代替並由呼叫端記錄 —— 不可靜默假裝有還原價。"""
    payload = {
        "chart": {"result": [{
            "timestamp": [1755734400],
            "indicators": {
                "quote": [{"open": [100.0], "high": [102.0], "low": [99.0],
                           "close": [101.0], "volume": [1000]}],
            },
        }]}
    }
    rows = parse_yahoo_chart(payload, code="0050")
    assert rows[0].adj_close == 101.0


def test_parse_yahoo_chart_on_error_response_returns_empty():
    assert parse_yahoo_chart({"chart": {"result": None}}, code="0050") == []
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd pipeline && pytest tests/test_sources.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 實作 base.py(共用的抓取工具)**

```python
"""資料源共用工具。

網路層與解析層刻意分離:解析為純函式,可用 fixture 測試而不連網。
"""
from __future__ import annotations

import time

import httpx

USER_AGENT = "alpha-track/0.1 (personal ETF tracker)"


def fetch_json(url: str, *, retries: int = 3, timeout: float = 30.0) -> object:
    """取得 JSON,失敗時指數退避重試。

    遇 429 限流一律等待後重試,不縮短間隔硬打 —— 免費 API 的額度
    用完之後短時間內反覆重試只會延長封鎖。
    """
    delay = 1.0
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            resp = httpx.get(url, timeout=timeout,
                             headers={"User-Agent": USER_AGENT},
                             follow_redirects=True)
            if resp.status_code == 429:
                time.sleep(delay * 4)
                delay *= 2
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                time.sleep(delay)
                delay *= 2
    raise RuntimeError(f"取得 {url} 失敗,已重試 {retries} 次") from last_exc


def to_float(value: object) -> float | None:
    """把 API 回傳的字串數字轉為 float。無法轉換時回傳 None,不回傳 0。"""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "")
    if text in ("", "--", "-", "N/A", "null"):
        return None
    try:
        return float(text)
    except ValueError:
        return None
```

- [ ] **Step 4: 實作 twse.py**

> 欄位名稱依 `docs/data-sources.md` 修正。以下為樣板。

```python
"""TWSE OpenAPI adapter。端點與欄位名依 docs/data-sources.md。"""
from __future__ import annotations

from datetime import date

from ..models import NavRecord, PriceRecord
from .base import to_float


def parse_twse_daily(payload: list[dict], trade_date: date) -> list[PriceRecord]:
    """解析每日收盤行情。無成交或欄位缺失的列一律略過。"""
    rows: list[PriceRecord] = []
    for item in payload:
        code = str(item.get("Code", "")).strip()
        close = to_float(item.get("ClosingPrice"))
        if not code or close is None or close <= 0:
            continue
        open_ = to_float(item.get("OpeningPrice")) or close
        high = to_float(item.get("HighestPrice")) or close
        low = to_float(item.get("LowestPrice")) or close
        volume = to_float(item.get("TradeVolume")) or 0.0
        rows.append(PriceRecord(
            code=code, date=trade_date, open=open_, high=high, low=low,
            close=close, volume=int(volume), adj_close=close,
        ))
    return rows


def parse_twse_nav(payload: list[dict], trade_date: date) -> list[NavRecord]:
    """解析 ETF 淨值。淨值或市價缺失的列略過 —— 折溢價算不出來就不寫。"""
    rows: list[NavRecord] = []
    for item in payload:
        code = str(item.get("Code", "")).strip()
        nav = to_float(item.get("NAV"))
        market = to_float(item.get("ClosingPrice"))
        if not code or nav is None or market is None or nav <= 0:
            continue
        rows.append(NavRecord(code=code, date=trade_date, nav=nav,
                              market_price=market,
                              fund_size=to_float(item.get("FundSize"))))
    return rows
```

- [ ] **Step 5: 實作 yahoo.py**

```python
"""Yahoo Finance adapter。僅用於歷史回補(規格 §3.1)。

非官方來源,可能變更或中斷。每日增量以官方 TWSE/TPEx 為主,
因此 Yahoo 失效時每日更新仍持續,只是暫時無法新增歷史回補。
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from ..models import PriceRecord

TAIPEI = ZoneInfo("Asia/Taipei")


def parse_yahoo_chart(payload: dict, code: str) -> list[PriceRecord]:
    """解析 chart API 回應。

    優先取 adjclose(還原權值價)。來源未提供時退回 close,
    此時報酬會是價格報酬而非含息報酬 —— 呼叫端須記錄此情況。
    """
    chart = payload.get("chart") or {}
    results = chart.get("result")
    if not results:
        return []

    result = results[0]
    timestamps = result.get("timestamp") or []
    indicators = result.get("indicators") or {}
    quotes = (indicators.get("quote") or [{}])[0]

    adj_list = None
    adjclose_block = indicators.get("adjclose")
    if adjclose_block:
        adj_list = adjclose_block[0].get("adjclose")

    rows: list[PriceRecord] = []
    for i, ts in enumerate(timestamps):
        close = _at(quotes.get("close"), i)
        if close is None or close <= 0:
            continue
        adj = _at(adj_list, i)
        if adj is None or adj <= 0:
            adj = close
        rows.append(PriceRecord(
            code=code,
            date=datetime.fromtimestamp(ts, TAIPEI).date(),
            open=_at(quotes.get("open"), i) or close,
            high=_at(quotes.get("high"), i) or close,
            low=_at(quotes.get("low"), i) or close,
            close=close,
            volume=int(_at(quotes.get("volume"), i) or 0),
            adj_close=adj,
        ))
    return rows


def _at(seq: list | None, i: int) -> float | None:
    if not seq or i >= len(seq):
        return None
    value = seq[i]
    return float(value) if value is not None else None
```

- [ ] **Step 6: 實作 finmind.py**

```python
"""FinMind adapter。配息紀錄,用於交叉驗證還原股價(規格 §4.1)。"""
from __future__ import annotations

from datetime import date

from ..models import DividendRecord
from .base import to_float


def parse_finmind_dividends(payload: dict) -> list[DividendRecord]:
    """解析配息資料。欄位名依 docs/data-sources.md 修正。"""
    items = payload.get("data") or []
    rows: list[DividendRecord] = []
    for item in items:
        code = str(item.get("stock_id", "")).strip()
        ex_raw = item.get("CashExDividendTradingDate") or item.get("date")
        amount = to_float(item.get("CashEarningsDistribution"))
        if not code or not ex_raw or amount is None or amount <= 0:
            continue
        pay_raw = item.get("CashDividendPaymentDate")
        rows.append(DividendRecord(
            code=code,
            ex_date=date.fromisoformat(str(ex_raw)),
            pay_date=date.fromisoformat(str(pay_raw)) if pay_raw else None,
            amount=amount,
        ))
    return rows
```

建立空的 `pipeline/src/alpha_track/sources/__init__.py`。

- [ ] **Step 7: 執行測試確認通過**

Run: `cd pipeline && pytest tests/test_sources.py -v`
Expected: 7 passed

- [ ] **Step 8: 以真實 fixture 補一輪測試**

用 Task 1 存下的 `tests/fixtures/*.json` 各寫一個測試,
確認解析函式吃得下真實回應且回傳非空:

```python
def test_parse_real_twse_fixture():
    payload = json.loads((FIXTURES / "twse_stock_day_all.json").read_text("utf-8"))
    rows = parse_twse_daily(payload, trade_date=date(2026, 8, 21))
    assert len(rows) > 100, "真實回應應包含大量標的"
    assert all(r.close > 0 for r in rows)
```

Run: `cd pipeline && pytest tests/test_sources.py -v`
Expected: 全數通過

- [ ] **Step 9: Commit**

```bash
git add pipeline/src/alpha_track/sources/ pipeline/tests/test_sources.py
git commit -m "feat: TWSE/Yahoo/FinMind adapter,解析與網路層分離"
```

---

## Task 10: 全市場指標計算

**Files:**
- Create: `pipeline/src/alpha_track/compute.py`
- Test: `pipeline/tests/test_compute.py`

**Interfaces:**
- Consumes: Task 2–7 的全部模組
- Produces:
  - `EtfMetrics` dataclass:`code`、`returns: dict[str, float | None]`、
    `annualized: dict[str, float | None]`、`volatility`、`mdd`、`sharpe`、`beta`、
    `premium_discount`
  - `compute_etf_metrics(prices, trading_days, base_date, risk_free, bench_rets, navs) -> EtfMetrics`

- [ ] **Step 1: 寫失敗測試**

```python
from datetime import date, timedelta

import pytest

from alpha_track.compute import compute_etf_metrics
from alpha_track.models import NavRecord, PriceRecord


def series(start: date, values: list[float], code="0050") -> list[PriceRecord]:
    """建立每日連續的價格序列(含週末,測試不需真實行事曆)。"""
    return [
        PriceRecord(code=code, date=start + timedelta(days=i), open=v, high=v,
                    low=v, close=v, volume=1000, adj_close=v)
        for i, v in enumerate(values)
    ]


def test_returns_none_for_periods_longer_than_history():
    """規格 §4.3:歷史不足該期間時輸出 None,不參與排名。"""
    prices = series(date(2026, 8, 1), [100.0] * 21)
    base = prices[-1].date
    m = compute_etf_metrics(prices, [p.date for p in prices], base,
                            risk_free=0.015, bench_returns=[], navs=[])
    assert m.returns["Y10"] is None
    assert m.returns["Y1"] is None
    assert m.returns["INCEPTION"] == pytest.approx(0.0)


def test_computes_inception_return_over_full_history():
    prices = series(date(2026, 1, 1), [100.0] + [0.0] * 0 + [110.0])
    base = prices[-1].date
    m = compute_etf_metrics(prices, [p.date for p in prices], base,
                            risk_free=0.015, bench_returns=[], navs=[])
    assert m.returns["INCEPTION"] == pytest.approx(0.10)


def test_d1_return_uses_previous_trading_day():
    prices = series(date(2026, 8, 1), [100.0, 100.0, 105.0])
    base = prices[-1].date
    m = compute_etf_metrics(prices, [p.date for p in prices], base,
                            risk_free=0.015, bench_returns=[], navs=[])
    assert m.returns["D1"] == pytest.approx(0.05)


def test_annualized_only_populated_for_long_periods():
    """規格 §4.2:一年以內不年化。"""
    values = [100.0 + i * 0.05 for i in range(1500)]  # 約四年
    prices = series(date(2022, 1, 1), values)
    base = prices[-1].date
    m = compute_etf_metrics(prices, [p.date for p in prices], base,
                            risk_free=0.015, bench_returns=[], navs=[])
    assert m.annualized["M3"] is None
    assert m.annualized["Y1"] is None
    assert m.annualized["Y3"] is not None


def test_risk_metrics_none_when_sample_too_short():
    """規格 §4.4:少於 60 個交易日不計算波動度與 MDD。"""
    prices = series(date(2026, 8, 1), [100.0] * 20)
    base = prices[-1].date
    m = compute_etf_metrics(prices, [p.date for p in prices], base,
                            risk_free=0.015, bench_returns=[], navs=[])
    assert m.volatility is None
    assert m.mdd is None


def test_constant_price_gives_zero_volatility_and_none_sharpe():
    prices = series(date(2025, 1, 1), [100.0] * 300)
    base = prices[-1].date
    m = compute_etf_metrics(prices, [p.date for p in prices], base,
                            risk_free=0.015, bench_returns=[], navs=[])
    assert m.volatility == pytest.approx(0.0)
    assert m.sharpe is None, "波動為零時 Sharpe 無定義"


def test_premium_discount_taken_from_latest_nav():
    prices = series(date(2026, 8, 1), [40.4] * 21, code="0056")
    base = prices[-1].date
    navs = [NavRecord(code="0056", date=base, nav=40.0,
                      market_price=40.4, fund_size=None)]
    m = compute_etf_metrics(prices, [p.date for p in prices], base,
                            risk_free=0.015, bench_returns=[], navs=navs)
    assert m.premium_discount == pytest.approx(0.01)


def test_premium_discount_is_none_without_nav_data():
    prices = series(date(2026, 8, 1), [40.4] * 21, code="0056")
    m = compute_etf_metrics(prices, [p.date for p in prices], prices[-1].date,
                            risk_free=0.015, bench_returns=[], navs=[])
    assert m.premium_discount is None


def test_empty_price_history_yields_all_none():
    m = compute_etf_metrics([], [], date(2026, 8, 21),
                            risk_free=0.015, bench_returns=[], navs=[])
    assert all(v is None for v in m.returns.values())
    assert m.volatility is None
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd pipeline && pytest tests/test_compute.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 實作 compute.py**

```python
"""全市場指標計算。把 Task 3–5 的純函式組合成單一 ETF 的完整指標。"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date

from .metrics.returns import cagr, total_return, years_between
from .metrics.risk import annualized_volatility, beta, daily_returns, max_drawdown
from .models import NavRecord, Period, PriceRecord
from .periods import period_start

MIN_DAYS_FOR_RISK = 60
"""規格 §4.4:少於此樣本數不計算波動度與最大回撤。"""

MIN_DAYS_FOR_SHARPE = 250
"""規格 §4.4:Sharpe 與 Beta 需至少一年樣本。"""


@dataclass
class EtfMetrics:
    code: str
    returns: dict[str, float | None] = field(default_factory=dict)
    annualized: dict[str, float | None] = field(default_factory=dict)
    volatility: float | None = None
    mdd: float | None = None
    sharpe: float | None = None
    beta: float | None = None
    premium_discount: float | None = None


def compute_etf_metrics(
    prices: Sequence[PriceRecord],
    trading_days: Sequence[date],
    base_date: date,
    risk_free: float,
    bench_returns: Sequence[float],
    navs: Sequence[NavRecord],
) -> EtfMetrics:
    """計算單一 ETF 的所有指標。資料不足的項目一律為 None。"""
    code = prices[0].code if prices else ""
    m = EtfMetrics(code=code)

    if not prices:
        m.returns = {p.value: None for p in Period}
        m.annualized = {p.value: None for p in Period}
        return m

    by_date = {p.date: p for p in prices}
    own_days = [p.date for p in prices]
    end = by_date[max(d for d in own_days if d <= base_date)]

    for period in Period:
        start_day = period_start(base_date, period, own_days)
        if start_day is None or start_day not in by_date:
            m.returns[period.value] = None
            m.annualized[period.value] = None
            continue
        start = by_date[start_day]
        ret = total_return(start.adj_close, end.adj_close)
        m.returns[period.value] = ret
        if period.annualize:
            m.annualized[period.value] = cagr(
                ret, years_between(start.date, end.date)
            )
        else:
            m.annualized[period.value] = None

    adj = [p.adj_close for p in prices if p.date <= base_date]
    if len(adj) >= MIN_DAYS_FOR_RISK:
        rets = daily_returns(adj)
        m.volatility = annualized_volatility(rets)
        m.mdd = max_drawdown(adj)
        if len(adj) >= MIN_DAYS_FOR_SHARPE:
            annual = m.annualized.get(Period.Y1.value) or m.returns.get(Period.Y1.value)
            if annual is not None:
                m.sharpe = (
                    None if m.volatility in (None, 0)
                    else (annual - risk_free) / m.volatility
                )
            if bench_returns and len(bench_returns) == len(rets):
                m.beta = beta(rets, bench_returns)

    latest_nav = max((n for n in navs if n.date <= base_date),
                     key=lambda n: n.date, default=None)
    if latest_nav is not None:
        m.premium_discount = latest_nav.premium_discount

    return m
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd pipeline && pytest tests/test_compute.py -v`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/alpha_track/compute.py pipeline/tests/test_compute.py
git commit -m "feat: 全市場指標計算組裝"
```

---

## Task 11: JSON 匯出(前後端契約)

**Files:**
- Create: `pipeline/src/alpha_track/export.py`
- Test: `pipeline/tests/test_export.py`

**Interfaces:**
- Consumes: `EtfMetrics` (Task 10)、`EtfProfile` (Task 2)、`Classification` (Task 6)
- Produces:
  - `build_rankings(rows) -> dict`、`build_meta(...) -> dict`、`write_json(path, data)`

> **本任務定義的 JSON 結構是前後端唯一契約。**
> 階段 1b 的 TypeScript 型別必須與此處欄位名稱逐字一致。
> 任何欄位改名都是破壞性變更,兩邊必須同步修改。

- [ ] **Step 1: 寫失敗測試**

```python
import json
from datetime import date
from pathlib import Path

from alpha_track.compute import EtfMetrics
from alpha_track.export import build_meta, build_rankings, write_json
from alpha_track.models import EtfProfile


def profile(code="0050", **kw) -> EtfProfile:
    base = dict(code=code, name="元大台灣50", listing_date=date(2003, 6, 30),
                exchange="TWSE", category="市值型", region="台灣")
    base.update(kw)
    return EtfProfile(**base)


def metrics(code="0050") -> EtfMetrics:
    m = EtfMetrics(code=code)
    m.returns = {"D1": 0.0052, "Y1": 0.1834, "Y10": None}
    m.annualized = {"D1": None, "Y1": None, "Y10": None}
    m.volatility = 0.1833
    m.mdd = -0.25
    m.sharpe = 0.9
    m.beta = 1.02
    m.premium_discount = 0.0012
    return m


def test_rankings_uses_exact_contract_field_names():
    out = build_rankings(date(2026, 8, 21), [(profile(), metrics(), 195.5)])
    assert set(out.keys()) == {"data_date", "etfs"}
    etf = out["etfs"][0]
    assert set(etf.keys()) == {
        "code", "name", "category", "region", "is_leveraged", "is_inverse",
        "close", "listing_date", "returns", "annualized", "risk",
        "premium_discount",
    }
    assert set(etf["risk"].keys()) == {"volatility", "mdd", "sharpe", "beta"}


def test_insufficient_data_serializes_as_json_null():
    """契約核心:null 代表資料不足,前端據此排到列表最末。"""
    out = build_rankings(date(2026, 8, 21), [(profile(), metrics(), 195.5)])
    text = json.dumps(out)
    assert '"Y10": null' in text.replace(", ", ", ")
    assert out["etfs"][0]["returns"]["Y10"] is None


def test_dates_serialize_as_iso_strings():
    out = build_rankings(date(2026, 8, 21), [(profile(), metrics(), 195.5)])
    assert out["data_date"] == "2026-08-21"
    assert out["etfs"][0]["listing_date"] == "2003-06-30"


def test_missing_listing_date_serializes_as_null():
    out = build_rankings(date(2026, 8, 21),
                         [(profile(listing_date=None), metrics(), 195.5)])
    assert out["etfs"][0]["listing_date"] is None


def test_meta_reports_health_status():
    m = build_meta(data_date=date(2026, 8, 21), etf_count=258,
                   unclassified=["00999"], anomalies=[("0056", "單日變動異常")],
                   is_stale=False, risk_free_rate=0.015)
    assert m["data_date"] == "2026-08-21"
    assert m["etf_count"] == 258
    assert m["unclassified"] == ["00999"]
    assert m["anomalies"] == [{"code": "0056", "reason": "單日變動異常"}]
    assert m["is_stale"] is False
    assert m["risk_free_rate"] == 0.015
    assert "generated_at" in m


def test_meta_marks_stale_when_batch_rejected():
    m = build_meta(data_date=date(2026, 8, 20), etf_count=258,
                   unclassified=[], anomalies=[], is_stale=True,
                   risk_free_rate=0.015)
    assert m["is_stale"] is True


def test_write_json_produces_utf8_without_ascii_escaping(tmp_path: Path):
    """中文必須以 UTF-8 原樣寫出,不轉義成 \\uXXXX —— 檔案會膨脹近三倍。"""
    p = tmp_path / "out.json"
    write_json(p, {"name": "元大台灣50"})
    assert "元大台灣50" in p.read_text(encoding="utf-8")


def test_write_json_creates_parent_directories(tmp_path: Path):
    p = tmp_path / "nested" / "deep" / "out.json"
    write_json(p, {"ok": True})
    assert p.exists()
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `cd pipeline && pytest tests/test_export.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 實作 export.py**

```python
"""JSON 匯出。定義前後端唯一契約。

規格 §5.3。欄位名稱與階段 1b 的 TypeScript 型別必須逐字一致;
改名是破壞性變更,兩邊須同步修改。

null 的意義固定為「資料不足」,前端據此把該列排到最末並顯示「—」。
絕不以 0 頂替。
"""
from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from .compute import EtfMetrics
from .models import EtfProfile

TAIPEI = ZoneInfo("Asia/Taipei")


def build_rankings(
    data_date: date,
    rows: Sequence[tuple[EtfProfile, EtfMetrics, float]],
) -> dict:
    """組裝 rankings.json。rows 為 (檔案, 指標, 最新收盤價)。"""
    return {
        "data_date": data_date.isoformat(),
        "etfs": [
            {
                "code": p.code,
                "name": p.name,
                "category": p.category,
                "region": p.region,
                "is_leveraged": p.is_leveraged,
                "is_inverse": p.is_inverse,
                "close": close,
                "listing_date": p.listing_date.isoformat() if p.listing_date else None,
                "returns": m.returns,
                "annualized": m.annualized,
                "risk": {
                    "volatility": m.volatility,
                    "mdd": m.mdd,
                    "sharpe": m.sharpe,
                    "beta": m.beta,
                },
                "premium_discount": m.premium_discount,
            }
            for p, m, close in rows
        ],
    }


def build_meta(
    *,
    data_date: date,
    etf_count: int,
    unclassified: Sequence[str],
    anomalies: Sequence[tuple[str, str]],
    is_stale: bool,
    risk_free_rate: float,
) -> dict:
    """組裝 meta.json,驅動前端的資料健康狀態列(規格 §5.5)。"""
    return {
        "generated_at": datetime.now(TAIPEI).isoformat(timespec="seconds"),
        "data_date": data_date.isoformat(),
        "is_stale": is_stale,
        "etf_count": etf_count,
        "unclassified": list(unclassified),
        "anomalies": [{"code": c, "reason": r} for c, r in anomalies],
        "risk_free_rate": risk_free_rate,
    }


def write_json(path: Path, data: object) -> None:
    """寫出 JSON。中文不轉義,避免檔案體積膨脹近三倍。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
```

- [ ] **Step 4: 執行測試確認通過**

Run: `cd pipeline && pytest tests/test_export.py -v`
Expected: 8 passed

- [ ] **Step 5: 記錄契約到文件**

建立 `docs/json-contract.md`,貼上一份完整的 `rankings.json` 與 `meta.json`
範例(以測試產出的實際結構為準)。階段 1b 的前端型別以此文件為準。

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/alpha_track/export.py pipeline/tests/test_export.py docs/json-contract.md
git commit -m "feat: JSON 匯出與前後端契約文件"
```

---

## Task 12: CLI 與每日排程

**Files:**
- Create: `pipeline/src/alpha_track/cli.py`
- Create: `config/settings.yaml`
- Create: `.github/workflows/daily.yml`
- Test: `pipeline/tests/test_cli.py`

**Interfaces:**
- Consumes: Task 2–11 的全部模組
- Produces: `python -m alpha_track.cli update` 指令;`web/public/data/` 下的 JSON 檔

- [ ] **Step 1: 建立設定檔**

`config/settings.yaml`:

```yaml
# 無風險利率,用於 Sharpe 計算(規格 §4.5a)
# 前端會在 Sharpe 欄位旁顯示此數值,使結果可被檢驗
risk_free_rate: 0.015

# 匯出目標目錄(相對於專案根目錄)
output_dir: web/public/data

# 資料庫位置
db_path: data/alpha_track.db

# 超過此天數未更新,前端顯示顯著警告(規格 §8.2)
stale_warning_days: 3
```

- [ ] **Step 2: 寫失敗測試**

```python
from datetime import date
from pathlib import Path

import pytest
import yaml

from alpha_track.cli import Settings, load_settings, run_export


def test_load_settings_reads_yaml(tmp_path: Path):
    f = tmp_path / "settings.yaml"
    f.write_text(yaml.safe_dump({
        "risk_free_rate": 0.02, "output_dir": "out",
        "db_path": "d.db", "stale_warning_days": 5,
    }), encoding="utf-8")
    s = load_settings(f)
    assert s.risk_free_rate == 0.02
    assert s.stale_warning_days == 5


def test_load_settings_applies_defaults_for_missing_keys(tmp_path: Path):
    f = tmp_path / "settings.yaml"
    f.write_text("risk_free_rate: 0.02\n", encoding="utf-8")
    s = load_settings(f)
    assert s.risk_free_rate == 0.02
    assert s.output_dir == "web/public/data"


def test_run_export_writes_both_json_files(tmp_path: Path):
    """匯出後 rankings.json 與 meta.json 都必須存在 —— 前端兩者都要。"""
    from alpha_track.storage import Database
    from alpha_track.models import EtfProfile, PriceRecord

    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_profiles([EtfProfile(code="0050", name="元大台灣50",
                                       listing_date=date(2003, 6, 30),
                                       exchange="TWSE", category="市值型")])
        db.upsert_prices([
            PriceRecord(code="0050", date=date(2026, 8, 20), open=194.0,
                        high=195.0, low=193.0, close=194.0, volume=1000,
                        adj_close=194.0),
            PriceRecord(code="0050", date=date(2026, 8, 21), open=195.0,
                        high=196.0, low=194.0, close=195.5, volume=1000,
                        adj_close=195.5),
        ])

    out = tmp_path / "out"
    settings = Settings(risk_free_rate=0.015, output_dir=str(out),
                        db_path=str(db_path), stale_warning_days=3)
    run_export(settings, is_stale=False, unclassified=[], anomalies=[])

    assert (out / "rankings.json").exists()
    assert (out / "meta.json").exists()


def test_run_export_on_empty_database_still_writes_meta(tmp_path: Path):
    """空資料庫不得讓匯出崩潰 —— 前端需要 meta 才能顯示錯誤狀態。"""
    from alpha_track.storage import Database

    db_path = tmp_path / "empty.db"
    with Database(db_path) as db:
        db.init_schema()

    out = tmp_path / "out"
    settings = Settings(risk_free_rate=0.015, output_dir=str(out),
                        db_path=str(db_path), stale_warning_days=3)
    run_export(settings, is_stale=True, unclassified=[], anomalies=[])

    assert (out / "meta.json").exists()
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `cd pipeline && pytest tests/test_cli.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 4: 實作 cli.py**

```python
"""Pipeline 進入點。

指令:
  python -m alpha_track.cli update    # 抓取 → 驗證 → 儲存 → 計算 → 匯出
  python -m alpha_track.cli export    # 只重新計算並匯出(不連網)
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import yaml

from .categories import classify, load_category_map
from .compute import compute_etf_metrics
from .export import build_meta, build_rankings, write_json
from .models import EtfProfile
from .storage import Database

ROOT = Path(__file__).resolve().parents[3]


@dataclass
class Settings:
    risk_free_rate: float = 0.015
    output_dir: str = "web/public/data"
    db_path: str = "data/alpha_track.db"
    stale_warning_days: int = 3


def load_settings(path: Path) -> Settings:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return Settings(
        risk_free_rate=raw.get("risk_free_rate", 0.015),
        output_dir=raw.get("output_dir", "web/public/data"),
        db_path=raw.get("db_path", "data/alpha_track.db"),
        stale_warning_days=raw.get("stale_warning_days", 3),
    )


def run_export(
    settings: Settings,
    *,
    is_stale: bool,
    unclassified: list[str],
    anomalies: list[tuple[str, str]],
) -> None:
    """自資料庫計算指標並匯出 JSON。不連網,可獨立重跑。"""
    out_dir = Path(settings.output_dir)
    category_map = load_category_map(ROOT / "config" / "etf_categories.yaml")

    with Database(Path(settings.db_path)) as db:
        base_date = db.latest_price_date()
        if base_date is None:
            write_json(out_dir / "meta.json", build_meta(
                data_date=date.today(), etf_count=0, unclassified=[],
                anomalies=[("*", "資料庫為空,尚未取得任何價格資料")],
                is_stale=True, risk_free_rate=settings.risk_free_rate,
            ))
            return

        trading_days = db.trading_days()
        rows = []
        for code in db.all_codes():
            prices = db.get_prices(code)
            if not prices:
                continue
            cls = classify(code, category_map)
            profile = EtfProfile(
                code=code, name=code, listing_date=prices[0].date,
                exchange="TWSE", category=cls.category, region=cls.region,
                is_leveraged=cls.is_leveraged, is_inverse=cls.is_inverse,
            )
            metrics = compute_etf_metrics(
                prices, trading_days, base_date,
                risk_free=settings.risk_free_rate,
                bench_returns=[], navs=db.get_navs(code),
            )
            rows.append((profile, metrics, prices[-1].close))

        write_json(out_dir / "rankings.json", build_rankings(base_date, rows))
        write_json(out_dir / "meta.json", build_meta(
            data_date=base_date, etf_count=len(rows),
            unclassified=unclassified, anomalies=anomalies,
            is_stale=is_stale, risk_free_rate=settings.risk_free_rate,
        ))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="alpha-track")
    parser.add_argument("command", choices=["update", "export"])
    parser.add_argument("--config", default=str(ROOT / "config" / "settings.yaml"))
    args = parser.parse_args(argv)

    settings = load_settings(Path(args.config))

    if args.command == "export":
        run_export(settings, is_stale=False, unclassified=[], anomalies=[])
        return 0

    # update:抓取由 Task 9 的 adapter 提供,依 docs/data-sources.md 接上
    raise SystemExit(
        "update 尚未接上資料源。請先完成 Task 1 的勘查,"
        "依 docs/data-sources.md 於此處呼叫 sources/ 的 adapter。"
    )


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: 執行測試確認通過**

Run: `cd pipeline && pytest tests/test_cli.py -v`
Expected: 4 passed

- [ ] **Step 6: 寫 update 流程的失敗測試**

先測流程決策,不測網路。抓取以參數注入,測試傳入假的抓取函式。

在 `pipeline/tests/test_cli.py` 追加:

```python
def test_update_skips_write_and_marks_stale_when_batch_rejected(tmp_path: Path):
    """規格 §8.1:整批被拒時保留前一日資料並標記 stale。"""
    from alpha_track.cli import run_update
    from alpha_track.models import PriceRecord
    from alpha_track.storage import Database

    db_path = tmp_path / "t.db"
    yesterday = [PriceRecord(code=f"00{i:03d}", date=date(2026, 8, 20), open=10.0,
                             high=10.0, low=10.0, close=10.0, volume=1,
                             adj_close=10.0) for i in range(100)]
    with Database(db_path) as db:
        db.init_schema()
        db.upsert_prices(yesterday)

    out = tmp_path / "out"
    settings = Settings(risk_free_rate=0.015, output_dir=str(out),
                        db_path=str(db_path), stale_warning_days=3)

    # 今日只回傳 1 檔 —— 檔數暴跌,應觸發整批拒絕
    def fake_fetch(_settings):
        return [PriceRecord(code="0050", date=date(2026, 8, 21), open=10.0,
                            high=10.0, low=10.0, close=10.0, volume=1,
                            adj_close=10.0)], [], []

    run_update(settings, fetch_all=fake_fetch)

    with Database(db_path) as db:
        assert db.latest_price_date() == date(2026, 8, 20), "壞資料不得覆蓋好資料"

    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    assert meta["is_stale"] is True


def test_update_writes_and_exports_when_batch_is_clean(tmp_path: Path):
    from alpha_track.cli import run_update
    from alpha_track.models import PriceRecord
    from alpha_track.storage import Database

    db_path = tmp_path / "t.db"
    with Database(db_path) as db:
        db.init_schema()

    out = tmp_path / "out"
    settings = Settings(risk_free_rate=0.015, output_dir=str(out),
                        db_path=str(db_path), stale_warning_days=3)

    def fake_fetch(_settings):
        return [PriceRecord(code="0050", date=date(2026, 8, 21), open=195.0,
                            high=196.0, low=194.0, close=195.5, volume=1000,
                            adj_close=195.5)], [], []

    run_update(settings, fetch_all=fake_fetch)

    with Database(db_path) as db:
        assert db.latest_price_date() == date(2026, 8, 21)

    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    assert meta["is_stale"] is False
```

在測試檔頂端加入 `import json`。

Run: `cd pipeline && pytest tests/test_cli.py -v`
Expected: FAIL — `cannot import name 'run_update'`

- [ ] **Step 7: 實作 run_update**

在 `cli.py` 加入。抓取以 `fetch_all` 參數注入,使流程可測而不連網:

```python
from collections.abc import Callable

from .models import DividendRecord, NavRecord, PriceRecord
from .validation import validate_price_batch

FetchAll = Callable[
    [Settings], tuple[list[PriceRecord], list[NavRecord], list[DividendRecord]]
]


def fetch_all_sources(settings: Settings) -> tuple[
    list[PriceRecord], list[NavRecord], list[DividendRecord]
]:
    """自各來源取得當日資料。

    端點 URL 依 docs/data-sources.md 填入。每個來源獨立 try:
    單一來源失敗不得中斷其餘來源(規格 §8.1)。
    """
    from .sources.base import fetch_json
    from .sources.finmind import parse_finmind_dividends
    from .sources.twse import parse_twse_daily, parse_twse_nav

    today = date.today()
    prices: list[PriceRecord] = []
    navs: list[NavRecord] = []
    dividends: list[DividendRecord] = []

    # URL 常數依 docs/data-sources.md 的實測結果填入
    for url, parser, sink in (
        (TWSE_DAILY_URL, lambda d: parse_twse_daily(d, today), prices),
        (TWSE_NAV_URL, lambda d: parse_twse_nav(d, today), navs),
        (FINMIND_DIVIDEND_URL, parse_finmind_dividends, dividends),
    ):
        try:
            sink.extend(parser(fetch_json(url)))
        except Exception as exc:
            print(f"[warn] {url} 取得失敗:{exc}", file=sys.stderr)

    return prices, navs, dividends


def run_update(settings: Settings, *, fetch_all: FetchAll = fetch_all_sources) -> None:
    """每日更新:抓取 → 驗證 → 寫入 → 計算 → 匯出。

    驗證未通過時跳過寫入,保留前一日資料並以 is_stale=True 匯出 ——
    寧可顯示昨天的正確數字,也不要顯示今天的錯誤數字。
    """
    prices, navs, dividends = fetch_all(settings)

    db_path = Path(settings.db_path)
    with Database(db_path) as db:
        db.init_schema()
        prev_date = db.latest_price_date()
        prev_closes: dict[str, float] = {}
        prev_count = 0
        if prev_date is not None:
            for code in db.all_codes():
                rows = [p for p in db.get_prices(code) if p.date == prev_date]
                if rows:
                    prev_closes[code] = rows[-1].close
            prev_count = len(prev_closes)

        ex_dates = {(d.code, d.ex_date) for d in dividends}
        result = validate_price_batch(prices, prev_count, prev_closes, ex_dates)

        if result.batch_rejected:
            print(f"[error] 整批拒絕:{result.batch_reason}", file=sys.stderr)
            run_export(settings, is_stale=True, unclassified=[],
                       anomalies=[("*", result.batch_reason or "驗證未通過")])
            return

        db.upsert_prices(result.accepted)
        db.upsert_navs(navs)
        db.upsert_dividends(dividends)

    category_map = load_category_map(ROOT / "config" / "etf_categories.yaml")
    unclassified = [
        c for c in {r.code for r in result.accepted}
        if classify(c, category_map).category == "未分類"
    ]
    run_export(settings, is_stale=False, unclassified=sorted(unclassified),
               anomalies=result.flagged)
```

把 `main()` 中的 `update` 分支換成:

```python
    if args.command == "update":
        run_update(settings)
        return 0
```

並刪除原本的 `raise SystemExit(...)`。

- [ ] **Step 8: 執行測試確認通過**

Run: `cd pipeline && pytest tests/test_cli.py -v`
Expected: 6 passed

- [ ] **Step 9: 依實測結果填入端點常數**

自 `docs/data-sources.md` 取得實際 URL,在 `cli.py` 頂端定義:

```python
# 端點來自 docs/data-sources.md 的實測記錄,非憑記憶編寫
TWSE_DAILY_URL = "<自 data-sources.md 填入>"
TWSE_NAV_URL = "<自 data-sources.md 填入>"
FINMIND_DIVIDEND_URL = "<自 data-sources.md 填入>"
```

若某個來源在 Task 1 被判定為不可用,把對應那一組自 `fetch_all_sources`
的迴圈中移除,並在 `docs/data-sources.md` 註明。

- [ ] **Step 10: 執行完整測試套件**

Run: `cd pipeline && pytest -v`
Expected: 全數通過

- [ ] **Step 11: 建立 GitHub Actions 排程**

`.github/workflows/daily.yml`:

```yaml
name: 每日資料更新

on:
  schedule:
    # 台北時間 18:00(UTC 10:00),收盤後兩小時,留給交易所結算時間
    - cron: "0 10 * * 1-5"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: 安裝相依套件
        run: pip install -e "pipeline[dev]"

      - name: 執行測試
        run: cd pipeline && pytest -q

      - name: 還原資料庫快取
        uses: actions/cache@v4
        with:
          path: data/alpha_track.db
          key: alpha-track-db-${{ github.run_id }}
          restore-keys: alpha-track-db-

      - name: 更新資料
        run: python -m alpha_track.cli update
        env:
          PYTHONPATH: pipeline/src

      - name: 提交更新的 JSON
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add web/public/data/
          git diff --staged --quiet || git commit -m "chore: 每日資料更新 $(date +%F)"
          git push
```

- [ ] **Step 12: Commit**

```bash
git add pipeline/src/alpha_track/cli.py pipeline/tests/test_cli.py config/settings.yaml .github/workflows/daily.yml
git commit -m "feat: CLI 進入點與每日排程"
```

---

## 完成標準

階段 1a 完成時,以下全部成立:

- [ ] `cd pipeline && pytest` 全數通過
- [ ] `docs/data-sources.md` 記錄實測過的端點與欄位
- [ ] `docs/json-contract.md` 記錄前後端契約
- [ ] `python -m alpha_track.cli update` 能產生 `web/public/data/rankings.json`
- [ ] 該 JSON 含 100 檔以上 ETF,且資料不足處為 `null` 而非 `0`
- [ ] 連續執行兩次 `update`,資料庫列數不變(冪等)
- [ ] GitHub Actions workflow 手動觸發成功
