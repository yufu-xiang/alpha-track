"""Yahoo Finance adapter。僅用於歷史回補(規格 §3.1)。

非官方來源,可能變更或中斷。每日增量以官方 TWSE/TPEx 為主,
因此 Yahoo 失效時每日更新仍持續,只是暫時無法新增歷史回補。
"""
from __future__ import annotations

import logging
from datetime import datetime
from math import log
from statistics import median
from zoneinfo import ZoneInfo

from ..models import PriceRecord

logger = logging.getLogger(__name__)

TAIPEI = ZoneInfo("Asia/Taipei")

MAX_PLAUSIBLE_DAILY_MOVE = 0.35
"""單日變動超過此幅度就**值得懷疑**,但不足以斷定是分割。

台股上市證券單日漲跌幅上限 10%、槓桿型 20%。追蹤海外指數或商品期貨者
不受限,實測 00715L(布蘭特原油正2)在 2020 年油價崩盤期間有多天超過
40%,2026-03-09 更達 +62%。所以這個門檻只用來挑出候選,是否截斷要看倍率。
"""

SPLIT_RATIOS = tuple(range(2, 11))
"""可信的分割倍率。實測 347 檔的回補中出現過 1:2、1:3、1:4、1:7,
以及反分割 ×4、×5、×6、×7 —— 全部是乾淨的整數比。"""

SPLIT_RATIO_TOLERANCE = 0.10

PERSISTENCE_WINDOW = 5
"""跳空之後要觀察幾個交易日,才判斷新水位是不是「留下來了」。"""

PERSISTENCE_MARGIN = 5.0
"""新水位要比舊水位近多少倍,才算尺度改變。

實測兩個真實案例的分離度極大,所以這個門檻不敏感:
  - 00631L(2015-01-05,尺度改變):跳後五日中位數距新水位 0.0026、
    距舊水位 3.086 —— 相差 **1169 倍**
  - 00715L(2026-03-09,真實行情):0.211 對 0.273 —— 只有 **1.29 倍**
取 5 遠離兩者。
"""
"""倍率與整數比的容許誤差。

留 10% 是因為分割當天大盤也在動:1:4 分割搭配 -5% 的行情是 4.21 倍。
實測這個寬度剛好把 13 筆真分割全數納入,並把四筆對不上的排除在外
(21.74、2.19、1.62、1.44)。

代價是 3:2 這類非整數分割會被漏掉。台股 ETF 未見此種比例;
真的出現時會由下方的警告露出來,而不是靜默地照單全收。
"""


def parse_yahoo_chart(payload: dict, code: str) -> list[PriceRecord]:
    """解析 chart API 回應。

    優先取 adjclose(還原權值價)。來源未提供時退回 close,
    此時報酬會是價格報酬而非含息報酬 —— 呼叫端須記錄此情況。

    粒度檢查不可省略:Yahoo 對長歷史標的會把 interval=1d 靜默降頻為月線,
    HTTP 200 且不報錯,只有 meta.dataGranularity 會變(實測 0050.TW 從 4322 筆
    逐日變成 213 筆月線)。月線被當成日線存入,波動度、最大回撤、Beta 全部會錯,
    而且錯得非常像真的。寧可拋例外中斷,也不要讓錯誤資料進資料庫(ledger R13)。
    """
    chart = payload.get("chart") or {}
    results = chart.get("result")
    if not results:
        return []

    result = results[0]
    granularity = (result.get("meta") or {}).get("dataGranularity")
    if granularity is not None and granularity != "1d":
        raise ValueError(
            f"{code} 的回應粒度為 {granularity},非日線。"
            f"請改用 period1/period2 明確指定區間,不要用 range=max。"
        )
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
            # 時間戳是當日 09:00 台北時間(01:00 UTC),轉台北時區取日期。
            date=datetime.fromtimestamp(ts, TAIPEI).date(),
            open=_at(quotes.get("open"), i) or close,
            high=_at(quotes.get("high"), i) or close,
            low=_at(quotes.get("low"), i) or close,
            close=close,
            volume=int(_at(quotes.get("volume"), i) or 0),
            adj_close=adj,
        ))
    return _drop_history_before_unadjusted_split(rows, code)


def _looks_like_split(ratio: float) -> int | None:
    """倍率若接近某個可信的分割比就回傳該比例,否則回傳 None。

    ratio 一律以「大於 1」的形式傳入(正分割取倒數),因此正分割與
    反分割共用同一組判定。
    """
    for n in SPLIT_RATIOS:
        if abs(ratio - n) / n <= SPLIT_RATIO_TOLERANCE:
            return n
    return None


def _drop_history_before_unadjusted_split(
    rows: list[PriceRecord], code: str
) -> list[PriceRecord]:
    """砍掉最後一次尺度斷裂之前的歷史,只保留最近的連續區段。

    Yahoo 的 adjclose 只做配息回溯調整,**分割不一定含在內**,而且
    `events` 裡也不保證有 `splits` 可供偵測 —— 實測 0050.TW 在 2014-01-02
    有一次 1:4 分割(價格比 0.2494、成交股數 ×4.96 而成交金額連續、
    兩側 close/adj 比值同為 1.5785),回應中完全沒有任何欄位提及它。

    未處理的話,跨越該日的指標全部是安靜的錯誤數字:MDD 變成 -77%(實為
    分割本身)、全歷史波動度被一天灌爆、成立以來報酬低估約四倍。

    這裡刻意**不**回推倍率去修正舊資料 —— 那是拿猜測填進資料庫,違反
    「資料不足就是 null,不用替代值」。捨棄斷裂前的區段則不發明任何數字:
    `data_start` 自然變成分割日,compute 的掛牌日閘門(R14)就會據此
    把「成立以來」正確地標成 null。
    """
    for i in range(len(rows) - 1, 0, -1):
        prev = rows[i - 1].adj_close
        if prev <= 0:
            continue
        change = rows[i].adj_close / prev - 1.0
        if abs(change) <= MAX_PLAUSIBLE_DAILY_MOVE:
            continue

        gap = rows[i].adj_close / prev
        ratio = gap if gap > 1 else 1 / gap
        split = _looks_like_split(ratio)
        if split is not None:
            logger.warning(
                "%s 在 %s 有 %.1f%% 的單日跳空,倍率 %.2f 判定為未調整的 1:%d 分割;"
                "捨棄該日之前的 %d 筆歷史,起點改為 %s",
                code, rows[i].date, change * 100, ratio, split, i, rows[i].date,
            )
            return rows[i:]

        # 對不上任何整數分割比。這裡再問一個問題:**新水位留下來了嗎?**
        #
        # 留下來 → 不管成因是什麼(未公告的分割、面額變更、來源換了標的),
        #          斷點之前的資料與之後不在同一個尺度上,留著必然是錯的。
        # 沒留下 → 那是一天的跳動或壞跳點,不是尺度改變。砍掉數年歷史的
        #          代價遠高於留著,而且誤砍會表現為「長期報酬是 null」,
        #          與「這檔太新」完全無法區分。
        if _level_persisted(rows, i):
            logger.warning(
                "%s 在 %s 有 %.1f%% 的單日跳空,%.2f 倍對不上任何分割比,"
                "但新水位在其後 %d 個交易日持續存在 —— 判定為尺度改變,"
                "捨棄該日之前的 %d 筆歷史,起點改為 %s",
                code, rows[i].date, change * 100, ratio,
                PERSISTENCE_WINDOW, i, rows[i].date,
            )
            return rows[i:]

        logger.warning(
            "%s 在 %s 有 %.1f%% 的單日跳空,%.2f 倍對不上任何分割比,"
            "且價位隨後回到原水位 —— 判定為真實行情或單日壞跳點,保留完整歷史。",
            code, rows[i].date, change * 100, ratio,
        )
    return rows


def _level_persisted(rows: list[PriceRecord], i: int) -> bool:
    """跳空之後的價位,是靠近**新**水位還是回到**舊**水位?

    前後**都取中位數**,不是拿跳空前一天當基準。這一點是實測逼出來的:
    00633L 在 2015-02-05 有一個孤立的壞點(36.77 → **24.50** → 35.16),
    只看前一天的話,2015-02-06 從 24.50 跳回 35.16 會被判成「新水位持續」,
    於是把三個月的歷史砍掉 —— 而實際上是那一天的 24.50 有問題。
    取中位數之後,「跳空前的水位」是 35.33 而非 24.50 —— 壞點雖然還在視窗內,
    中位數不受它左右 —— 結論就反過來了。

    用中位數而非平均,是為了讓孤立的壞點與緊接著的第二個跳點都無法左右判斷。

    距離用對數比值:價格是幾何量,19.05 → 0.87 與 0.87 → 19.05 是同一件事,
    用絕對差值的話前者看起來比後者嚴重二十倍。
    """
    after = [r.adj_close for r in rows[i + 1: i + 1 + PERSISTENCE_WINDOW]
             if r.adj_close > 0]
    before = [r.adj_close for r in rows[max(0, i - PERSISTENCE_WINDOW): i]
              if r.adj_close > 0]
    # 樣本不足就不判斷。跳空落在序列末端時,我們還不知道它留不留得下來,
    # 而「還不知道」不該被當成「是尺度改變」——那會砍掉整段歷史。
    if len(after) < 3 or len(before) < 3:
        return False

    level = median(after)
    new_price = rows[i].adj_close
    old_price = median(before)
    if level <= 0 or new_price <= 0 or old_price <= 0:
        return False

    to_new = abs(log(level / new_price))
    to_old = abs(log(level / old_price))
    # 完全貼合新水位(to_new 為 0)是最強的證據,不能因為除以零而漏掉。
    if to_new == 0:
        return to_old > 0
    return to_old / to_new >= PERSISTENCE_MARGIN


def _at(seq: list | None, i: int) -> float | None:
    if not seq or i >= len(seq):
        return None
    value = seq[i]
    return float(value) if value is not None else None
