"""資料來源的健康檢查。

## 要解決的問題

本專案依賴四個免費來源,其中三個是**未公開的私有端點**:
TWSE MIS 的 `all_etf.txt`、投信投顧公會的 ASP.NET 表單、
TWSE 舊站的 TWT49U。它們改版不會有通知,而且——

**壞掉的樣子是靜默回空,不是報錯。**

實測過三次:公會的表單少帶一個 radio 就回原本的表單頁(HTTP 200、
沒有錯誤訊息、只是查詢沒發生);MIS 的無成交列回 `0` 而不是空值;
CI 的快取鍵固定導致 navs 每天被打回原點,而畫面上只顯示
「目前累積 1 個交易日」,看起來像功能剛上線。

現有的處理是 `logger.warning`,落在沒人看的 CI 日誌裡。

## 做法:不偵測改版,偵測後果

沒有辦法從外部判斷一個私有端點有沒有改版。但可以問一個更好回答的問題:
**今天產出的,和昨天差多少?**

這樣不需要任何魔術門檻,會自我校準 —— 標的數量隨市場成長,門檻跟著長。
月頻的來源(成分股)沒有「昨天」可比,改以資料的**新舊**判斷。

輸出走既有的 anomalies 管道,因此會出現在 meta.json 與前端的健康狀態列,
而不是只留在日誌裡。
"""
from __future__ import annotations

from datetime import date, timedelta

DROP_TOLERANCE = 0.10
"""較前一日減少超過此比例即回報。與價格批次的閘門同一個數字(規格 §8.1)。"""

HOLDINGS_STALE_DAYS = 75
"""成分股月報超過此天數未更新即回報。

公會每月第 10 個營業日公布上個月的資料,正常落後約 40 天。
75 天代表整整漏掉一個月份 —— 那多半是表單改版而查詢靜默失敗。
"""

SOURCE = "*"
"""anomalies 的代號欄。這些問題不屬於任何單一 ETF。"""


def check_sources(db, base_date: date) -> list[tuple[str, str]]:
    """回傳 (代號, 原因) 清單,空清單代表一切正常。

    `db` 需提供 count_prices_on / count_navs_on / previous_trading_day /
    count_dividends_with_prev_close / latest_holdings_month。
    """
    out: list[tuple[str, str]] = []
    previous = db.previous_trading_day(base_date)

    out += _compare_with_previous(
        "價格", db.count_prices_on(base_date),
        db.count_prices_on(previous) if previous else 0)

    navs_today = db.count_navs_on(base_date)
    if navs_today == 0:
        # 淨值來源只有當日快照、抓不到過去 —— 今天沒抓到就是永久少一天,
        # 補不回來。這一條必須立刻看得見。
        out.append((SOURCE, "今日完全沒有淨值資料,折溢價無法計算,"
                            "而淨值來源沒有歷史、這一天補不回來"))
    else:
        out += _compare_with_previous(
            "淨值", navs_today,
            db.count_navs_on(previous) if previous else 0)

    if db.count_dividends_with_prev_close() == 0:
        out.append((SOURCE, "沒有任何配息帶著除權息前收盤價,"
                            "分割過的標的其配息金額無法換算尺度"))

    month = db.latest_holdings_month()
    if month is None:
        out.append((SOURCE, "沒有任何成分股資料"))
    elif _month_age_days(month, base_date) > HOLDINGS_STALE_DAYS:
        out.append((SOURCE, f"成分股停留在 {month},已超過 "
                            f"{HOLDINGS_STALE_DAYS} 天未更新"))

    return out


def _compare_with_previous(label: str, today: int, previous: int) -> list[tuple[str, str]]:
    # 沒有前一日可比就不判斷(首次執行)。這裡回報「沒有基準」而不是
    # 硬套一個絕對門檻 —— 絕對門檻會在標的數成長後變成永遠不會響的警報。
    if previous == 0:
        return []
    if today == 0:
        return [(SOURCE, f"今日完全沒有{label}資料(前一日 {previous} 筆)")]
    if today < previous * (1 - DROP_TOLERANCE):
        return [(SOURCE, f"{label}自 {previous} 筆降為 {today} 筆,"
                         f"減幅超過 {DROP_TOLERANCE:.0%},疑似來源改版")]
    return []


def _month_age_days(year_month: str, today: date) -> int:
    """`YYYYMM` 距今幾天。以該月**月底**起算,不是月初。

    以月初起算會讓正常的落後(公布上個月資料)看起來多出三十天,
    於是門檻必須跟著放寬,而放寬到最後就抓不到真正的停滯。
    """
    try:
        year, month = int(year_month[:4]), int(year_month[4:6])
    except (ValueError, IndexError):
        return 10**6
    first_of_next = (date(year + 1, 1, 1) if month == 12
                     else date(year, month + 1, 1))
    return (today - (first_of_next - timedelta(days=1))).days
