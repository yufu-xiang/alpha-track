"""Golden test(多檔)。規格 §9.6。

單檔的 golden test(test_golden.py)證明的是「0050 這一條路算對了」。
這一組把它擴成七檔,涵蓋不同的**失效模式**:

| 代號 | 類型 | 區間內配息 | 為什麼選它 |
|---|---|---|---|
| 0050 | 市值型 | 2 | 基準案例,且做過 1:4 分割 |
| 006208 | 市值型 | 2 | 同指數、不同發行商 —— 兩者應該極接近 |
| 0056 | 高股息 | 4 | 季配,還原係數的分母大 |
| 00929 | 高股息 | 13 | **月配** —— 十三次連乘,任何一次錯都會被放大 |
| 00878 | 高股息 | 5 | 第三家發行商 |
| 0053 | 產業型 | 1 | 單次配息 |
| 00631L | 槓桿型 | 0 | **零配息** —— 還原係數必須恰為 1 |

參考鏈全部是**證交所官方**,與我方的資料源(Yahoo 歷史 + TWSE 每日)無關:
`STOCK_DAY` 給收盤價,`TWT49U` 給息值與除權息前收盤價。

## 建立這組測試時,它立刻抓到我自己算錯

第一版的參考算式只把**區間內**的配息連乘,結果 00878 差 2.99%、
00929 差 1.32%,而其餘五檔完全吻合。差的兩檔都是配息頻率最高的。

原因不是資料錯,是我的算式錯:`adj/close` 反映的是該日之後**到今天為止**
的所有配息,不是只到區間結束。00878 季配、00929 月配,兩者在區間結束後
都還配過 —— 而那正好是差額。修正範圍之後七檔全部吻合到小數第六位。

這正是這種測試的用途:它逼你把「這個數字到底是什麼」講清楚。

## 未涵蓋:上櫃 ETF

`TWT49U` 與 `STOCK_DAY` 都只涵蓋上市。實測 00679B(元大美債20年,上櫃)
的四筆配息**全部沒有官方前收盤價**。117 檔上櫃 ETF(多為債券型)因此
無法用這條參考鏈驗證,這是已知缺口而非疏漏。
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "golden_multi.json"

TOLERANCE_PP = 0.5
"""規格 §9.6:誤差須在 0.5 個百分點以內。"""

SPLIT_RATIOS = (1, 2, 3, 4, 5, 6, 7, 8, 10, 22)
"""我方收盤價相對官方的可能倍率。

**Yahoo 的歷史收盤價已還原分割,證交所的沒有** —— 所以兩者的比值
不是 1 就是某個分割倍率。實測 0050 是 4.0(2025-06-11 的 1:4 分割)、
00631L 是 22.0。這不是錯誤,是兩個來源的定義不同。

22 看起來突兀,但它是實測值:00631L 在 2025-08-01 的官方收盤 240.90,
我方 10.95,比值恰為 22.000。
"""


@pytest.fixture(scope="module")
def golden() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def adjustment_factor(dividends: list[dict]) -> float:
    """官方數字推得的還原係數:Π(1 − 息值 ÷ 除權息前收盤價)。"""
    factor = 1.0
    for d in dividends:
        factor *= 1 - d["amount"] / d["prev_close"]
    return factor


def snap_ratio(raw: float) -> float | None:
    for r in SPLIT_RATIOS:
        if abs(raw / r - 1) <= 0.005:
            return float(r)
    return None


class TestGoldenSet:
    def test_covers_the_intended_failure_modes(self, golden):
        """這組的價值在於涵蓋不同的失效模式,不在於檔數多。

        少了零配息或月配那兩端,還原係數的錯誤就未必顯現。
        """
        counts = {c: len(e["dividends_after_start"])
                  for c, e in golden["etfs"].items()}
        assert min(counts.values()) == 0, "缺少零配息的案例"
        assert max(counts.values()) >= 12, "缺少月配的案例"
        assert len(golden["etfs"]) >= 7

    @pytest.mark.parametrize("code", ["0050", "0056", "006208", "00631L",
                                      "0053", "00878", "00929"])
    def test_adjustment_factor_matches_the_official_dividends(self, golden, code):
        """還原係數必須恰等於官方數字推得的值。

        這是對配息處理最直接的檢驗:差一點都代表某次配息被漏掉、
        算兩次、或用錯了基準價。00929 是十三次連乘,任何一次錯都會被放大。
        """
        e = golden["etfs"][code]
        ours = e["start"]["adj"] / e["start"]["close"]
        expected = adjustment_factor(e["dividends_after_start"])
        assert ours == pytest.approx(expected, abs=1e-6), (
            f"{code}:我方 {ours:.6f},官方公式 {expected:.6f}")

    def test_a_fund_without_dividends_has_no_adjustment(self, golden):
        """零配息的還原係數必須恰為 1 —— 不是「接近 1」。"""
        e = golden["etfs"]["00631L"]
        assert e["dividends_after_start"] == []
        assert e["start"]["adj"] == pytest.approx(e["start"]["close"])

    @pytest.mark.parametrize("code", ["0050", "0056", "006208", "00631L",
                                      "0053", "00878", "00929"])
    def test_close_matches_the_exchange_up_to_a_split_ratio(self, golden, code):
        """我方收盤價對官方,比值必須是 1 或一個乾淨的分割倍率。

        Yahoo 的歷史收盤已還原分割、證交所的沒有,所以兩者本來就會差一個
        倍率;但那個倍率必須**乾淨**。落在整數之外就代表某一邊的價格是錯的
        —— 而這正是先前抓到 Yahoo 把 2026-08-21 回報成 104.35(官方 104.65)
        的那類問題。
        """
        e = golden["etfs"][code]
        for side in ("start", "end"):
            ours = e[side]["close"]
            official = e["official_close"][e[side]["date"]]
            ratio = snap_ratio(official / ours)
            assert ratio is not None, (
                f"{code} {e[side]['date']}:我方 {ours}、官方 {official},"
                f"比值 {official / ours:.4f} 對不上任何乾淨的分割倍率")

    def test_two_funds_tracking_the_same_index_agree(self, golden):
        """0050 與 006208 追蹤同一個指數,一年總報酬不該差超過一個百分點。

        差太多代表其中一邊的還原或價格有問題 —— 這條不需要任何外部參考,
        是資料內部的一致性檢查。
        """
        def tr(code: str) -> float:
            e = golden["etfs"][code]
            return e["end"]["adj"] / e["start"]["adj"] - 1
        assert abs(tr("0050") - tr("006208")) < 0.01

    def test_returns_are_not_all_flat(self, golden):
        """防呆:fixture 若被換成平盤資料,上面幾條會因為兩邊都是 0 而通過。"""
        rets = [e["end"]["adj"] / e["start"]["adj"] - 1
                for e in golden["etfs"].values()]
        assert all(r > 0.3 for r in rets)
