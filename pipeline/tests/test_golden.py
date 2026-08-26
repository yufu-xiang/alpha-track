"""Golden test。規格 §9.6。

> 單元測試只能證明「程式符合我的假設」,無法證明「我的假設符合現實」。
> 此測試是唯一能驗證整條鏈路真正算對的機制。

因此這裡的參考值**不是我算出來的**,而是三個外部權威來源的公開資料,
於 2026-08-26 實際取得並逐一記錄出處。整條鏈路(Yahoo 歷史回補 →
TWSE 每日增量 → 還原價 → 含息總報酬)必須與它們對得上。

## 參考資料出處

**① 基金淨值(元大投信官網)**
https://www.yuantaetfs.com/tradeInfo/comparison/0050/NAVhistory
「近一年」區間,243 個交易日。取得日期 2026-08-26。

| 日期 | 基金淨值(NAV) | 收盤市價 | 官網折溢價 |
|---|---|---|---|
| 2025/08/26 | 52.78 | 52.75 | 0.03(0.06%) |
| 2026/01/22 | 71.66 | 71.80 | — |
| 2026/07/21 | 102.77 | 102.50 | — |
| 2026/08/21 | 104.81 | 104.65 | 0.16(0.15%) |
| 2026/08/26 | 106.07 | 105.90 | 0.17(0.16%) |

註:官網的折溢價欄只顯示絕對值,不帶正負號。

**② 除權息(證交所 TWT49U,官方)**
https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=20250826&endDate=20260826
查詢區間內 0050 僅有兩次配息,皆為現金股利:

| 除息日 | 權值+息值 | 除權息前收盤價 |
|---|---|---|
| 2026/01/22 | 1.000000 | 71.85 |
| 2026/07/21 | 0.600000 | 99.20 |

**③ 收盤價(證交所 STOCK_DAY,官方)**
https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260801&stockNo=0050
115/08/20 103.80、115/08/21 104.65、115/08/25 104.40、115/08/26 105.90

## 為什麼容忍 0.5 個百分點

規格 §9.6 定的門檻。實測差異遠小於此(見各測試的斷言),而門檻留在 0.5
是因為兩邊量的本質不同:我方算的是**市價**含息報酬,參考值是基金的
**淨值**報酬,兩者相差一個折溢價的變化量。測試同時檢查兩種基準。

## 這個測試抓到過什麼

建立此測試時發現 Yahoo 對 2026-08-21 的收盤價回報 104.35,而證交所與
元大皆為 104.65。規格 §3.1「Yahoo 僅用於歷史回補,每日增量以官方
TWSE/TPEx 為主」因此不只是可用性考量,也是正確性考量 ——
若當初用 Yahoo 做每日增量,這一年的報酬會少 0.58 個百分點。
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from alpha_track.metrics.returns import total_return

FIXTURE = Path(__file__).parent / "fixtures" / "golden_0050_2025h2_2026h1.json"

TOLERANCE_PP = 0.5
"""規格 §9.6:誤差須在 0.5 個百分點以內。"""

# ① 元大投信官網
NAV = {
    date(2025, 8, 26): 52.78,
    date(2026, 1, 22): 71.66,
    date(2026, 7, 21): 102.77,
    date(2026, 8, 21): 104.81,
    date(2026, 8, 26): 106.07,
}
ISSUER_CLOSE = {
    date(2025, 8, 26): 52.75,
    date(2026, 8, 21): 104.65,
    date(2026, 8, 26): 105.90,
}
# ② 證交所 TWT49U:(除息日, 息值, 除權息前收盤價)
DIVIDENDS = [
    (date(2026, 1, 22), 1.000000, 71.85),
    (date(2026, 7, 21), 0.600000, 99.20),
]
# ③ 證交所 STOCK_DAY
TWSE_CLOSE = {
    date(2026, 8, 20): 103.80,
    date(2026, 8, 21): 104.65,
}

START = date(2025, 8, 26)
END = date(2026, 8, 21)


@pytest.fixture(scope="module")
def prices() -> dict[date, dict]:
    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return {date.fromisoformat(p["date"]): p for p in raw["prices"]}


def reference_total_return_on_nav() -> float:
    """基金淨值基準的含息總報酬。配息於除息日以當日淨值再投入。"""
    units = 1.0
    for ex_date, amount, _ in DIVIDENDS:
        units *= 1 + amount / NAV[ex_date]
    return units * NAV[END] / NAV[START] - 1.0


def reference_total_return_on_market() -> float:
    """換算為市價基準:淨值報酬再乘上折溢價的變化。

    我方算的是市價含息報酬,參考值是淨值報酬。兩者的差就是這段期間
    折溢價從多少變到多少 —— 不校正這一項,再精確的計算也對不上。
    """
    prem = {d: ISSUER_CLOSE[d] / NAV[d] for d in (START, END)}
    return (1 + reference_total_return_on_nav()) * prem[END] / prem[START] - 1.0


class TestGoldenTotalReturn:
    """整條鏈路的含息總報酬,對照外部公開資料。"""

    def test_matches_the_issuer_nav_based_return(self, prices):
        ours = total_return(prices[START]["adj_close"], prices[END]["adj_close"])
        ref = reference_total_return_on_nav()
        gap = abs(ours - ref) * 100
        assert gap < TOLERANCE_PP, (
            f"我方 {ours:.4%} 對照元大淨值基準 {ref:.4%},差 {gap:.3f} 個百分點"
        )

    def test_matches_even_better_once_premium_drift_is_removed(self, prices):
        """校正折溢價之後應該更接近 —— 若反而變遠,代表差異另有來源。"""
        ours = total_return(prices[START]["adj_close"], prices[END]["adj_close"])
        on_nav = abs(ours - reference_total_return_on_nav())
        on_market = abs(ours - reference_total_return_on_market())
        assert on_market < on_nav
        assert on_market * 100 < 0.2

    def test_the_return_is_actually_large(self, prices):
        """防呆:若 fixture 被換成一段平盤資料,上面兩條會因為都接近 0 而通過。"""
        ours = total_return(prices[START]["adj_close"], prices[END]["adj_close"])
        assert ours > 1.0


class TestGoldenAdjustmentFactor:
    """還原係數是否等於官方數字推出來的值。

    這是對「配息處理」最直接的檢驗:還原價 ÷ 原始收盤價,應該恰好等於
    此後每一次配息的 (1 − 息值 ÷ 除權息前收盤價) 連乘。差一點都代表
    某一次配息被漏掉、算兩次、或用錯了基準價。
    """

    def test_factor_equals_the_official_dividend_formula(self, prices):
        expected = 1.0
        for _, amount, prev_close in DIVIDENDS:
            expected *= 1 - amount / prev_close
        actual = prices[START]["adj_close"] / prices[START]["close"]
        assert actual == pytest.approx(expected, abs=1e-6), (
            f"還原係數 {actual:.6f},官方公式推得 {expected:.6f}"
        )

    def test_no_adjustment_remains_after_the_last_dividend(self, prices):
        """最後一次配息之後不該再有任何還原 —— 還原價就是收盤價。"""
        for d in (date(2026, 7, 21), END):
            assert prices[d]["adj_close"] == pytest.approx(prices[d]["close"])


class TestGoldenClosePrices:
    """收盤價對照證交所官方。

    這一條看似多餘,卻是建立本測試時真正抓到問題的那一條:
    Yahoo 對 2026-08-21 回報 104.35,官方是 104.65。
    """

    def test_closes_match_the_exchange(self, prices):
        for d, official in TWSE_CLOSE.items():
            assert prices[d]["close"] == pytest.approx(official, abs=0.005), (
                f"{d} 我方 {prices[d]['close']},證交所 {official}"
            )

    def test_closes_match_the_issuer_too(self, prices):
        for d, official in ISSUER_CLOSE.items():
            if d not in prices:
                continue
            assert prices[d]["close"] == pytest.approx(official, abs=0.005)


class TestGoldenPremiumDiscount:
    """折溢價對照元大官網公告。

    我方的淨值來自 TWSE MIS 的預估淨值,元大公告的是結算淨值 ——
    兩條完全獨立的路徑。
    """

    def test_our_premium_matches_the_issuer_announcement(self):
        from alpha_track.sources.twse import parse_twse_mis_etf

        payload = json.loads(
            (Path(__file__).parent / "fixtures" / "twse_mis_all_etf.json")
            .read_text(encoding="utf-8")
        )
        rows = {r.code: r for r in parse_twse_mis_etf(payload)}
        ours = rows["0050"].premium_discount
        d = date(2026, 8, 26)
        official = ISSUER_CLOSE[d] / NAV[d] - 1
        assert ours == pytest.approx(official, abs=1e-5), (
            f"我方 {ours:+.5%},元大公告 {official:+.5%}"
        )

    def test_sign_convention_is_ours_not_the_issuers(self):
        """元大官網的折溢價欄只顯示絕對值,不帶正負號。

        照抄會讓折價看起來像溢價 —— 方向剛好相反,而這一欄的用途
        正是判斷「買貴還是買便宜」。
        """
        d = date(2026, 8, 26)
        assert ISSUER_CLOSE[d] < NAV[d]
        assert (ISSUER_CLOSE[d] / NAV[d] - 1) < 0
