"""全市場指標計算。把 Task 3–5 的純函式組合成單一 ETF 的完整指標。"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta

from .metrics.returns import cagr, total_return, years_between
from .metrics.risk import (
    annualized_volatility,
    beta,
    daily_returns,
    max_drawdown,
    sharpe,
)
from .models import DividendRecord, NavRecord, Period, PriceRecord
from .periods import period_start

MIN_DAYS_FOR_RISK = 60
"""規格 §4.4:少於此樣本數不計算波動度與最大回撤。"""

MIN_DAYS_FOR_SHARPE = 250
"""規格 §4.4:Sharpe 與 Beta 需至少一年樣本。"""

VOLATILITY_WINDOW_DAYS = 250
"""年化波動度的取樣窗口(交易日),約一年。

刻意不用全歷史,理由有二:

1. **全歷史波動度不可比較。** 十年歷史與兩年歷史的基金,波動度量在不同
   長度、不同市場環境的窗口上,並排排序本身就不對等。固定窗口才能比。
2. **夏普值的分子分母要同窗口。** 分子是近一年報酬,分母若取全歷史,
   多頭年份會讓數值爆掉 —— 實測改版前 289 檔中有 84 檔(29%)大於 2,
   而判讀門檻正是 2,等於這個指標沒有訊號。

歷史不足此窗口者以手上全部資料計算(仍需滿足 MIN_DAYS_FOR_RISK),
不因此整欄留白。
"""

PREMIUM_WINDOW_DAYS = 60
"""折溢價區間與溢價天數佔比的取樣窗口。規格 §4.4。"""

MIN_DAYS_FOR_PREMIUM_STATS = 20
"""規格 §4.4:折溢價統計的最低樣本數。

不足即留空。折溢價的意義在於「這檔是不是經常性偏離淨值」,
而三、五天的樣本回答不了經常性 —— 一次除息前的搶購就能讓佔比變成 100%。
"""

LIQUIDITY_WINDOW_DAYS = 20
"""流動性取樣窗口(交易日),約一個月。

窗口要夠短才反映得出「現在」好不好買賣 —— 那正是流動性要回答的問題。
拿一年平均會被半年前的一次大額換手拖著,而使用者今天下單面對的是
今天的量。二十個交易日足以壓掉單日的偶發爆量,又不至於失去時效。
"""

DIVIDEND_YIELD_DAYS = 365
"""殖利率的回溯期間。採過去一年**實際配息**,不年化、不推估。

推估未來配息會把一次性的特別配息當成常態,殖利率排行會被那種標的
佔滿。過去一年實配是可查證的事實,推估不是。
"""

BENCHMARK_LOOKBACK_DAYS = 7
"""查基準指數時允許回看的天數。

基準與價格的出檔時間不一定同步:實測基準最新到 08-24 而價格已到 08-25。
要求日期精確吻合的話,超額報酬會整批變成 null。回看只是為了容忍這種
時間差與連假,不是拿幾週前的指數硬湊 —— 超過就回傳 None。
"""

INCEPTION_TOLERANCE_DAYS = 30
"""最早資料日期與掛牌日相差在此天數內,才認可「成立以來」報酬。
免費資料源的起始日常與掛牌日差幾個交易日,不必因此整欄作廢。"""


@dataclass
class EtfMetrics:
    code: str
    returns: dict[str, float | None] = field(default_factory=dict)
    annualized: dict[str, float | None] = field(default_factory=dict)
    excess: dict[str, float | None] = field(default_factory=dict)
    """相對加權報酬指數的超額報酬(規格 §4.5b)。同期間的標的報酬減大盤報酬。"""
    volatility: float | None = None
    mdd: float | None = None
    sharpe: float | None = None
    beta: float | None = None
    premium_discount: float | None = None
    premium_low: float | None = None
    """近 PREMIUM_WINDOW_DAYS 日的折溢價最小值(最深折價)。"""
    premium_high: float | None = None
    """近 PREMIUM_WINDOW_DAYS 日的折溢價最大值(最高溢價)。"""
    premium_days_ratio: float | None = None
    """近 PREMIUM_WINDOW_DAYS 日中,折溢價為正(溢價)的天數佔比。"""
    premium_sample: int = 0
    """實際納入折溢價統計的天數。少於 MIN_DAYS_FOR_PREMIUM_STATS 時上面三項為 None。"""
    fund_size: float | None = None
    """基金規模(新台幣元)= 已發行受益權單位數 × 每單位淨值。

    規格 §5.2 ② 要求個股頁顯示。它關係到流動性與清算風險 ——
    台灣規定 ETF 規模連續低於門檻可能下市,屆時被迫在低點實現損益。
    """
    data_start: date | None = None
    """最早持有價格資料的日期。與掛牌日不同時,前端據此說明實際涵蓋範圍。"""
    avg_volume: float | None = None
    """近 LIQUIDITY_WINDOW_DAYS 個交易日的平均成交股數。"""
    avg_turnover: float | None = None
    """近 LIQUIDITY_WINDOW_DAYS 個交易日的平均成交金額(股數 × 收盤價)。

    比較流動性要看**金額**不是股數:一檔 10 元的 ETF 與一檔 100 元的
    ETF 成交同樣的股數,實際換手的資金差十倍。只排成交量會讓低價 ETF
    系統性地看起來比較熱門。
    """
    dividend_yield: float | None = None
    """近一年配息總額 ÷ 最新收盤價。無配息紀錄者為 None,不是 0 ——
    「沒有資料」與「不配息」是兩件事,而排行榜必須分得出來。"""


def _benchmark_at(
    bench_closes: Mapping[date, float], target: date
) -> float | None:
    """取 target 當日的基準指數;當日沒有就往回找,最多 BENCHMARK_LOOKBACK_DAYS 天。"""
    for back in range(BENCHMARK_LOOKBACK_DAYS + 1):
        value = bench_closes.get(target - timedelta(days=back))
        if value is not None:
            return value
    return None


def compute_etf_metrics(
    prices: Sequence[PriceRecord],
    base_date: date,
    risk_free: float,
    bench_closes: Mapping[date, float],
    navs: Sequence[NavRecord],
    listing_date: date | None,
    dividends: Sequence[DividendRecord] = (),
) -> EtfMetrics:
    """計算單一 ETF 的所有指標。資料不足的項目一律為 None。

    期間起點以「該 ETF 自己的交易日」為基準,而非全市場交易日曆:
    起點必須是這檔真的有價格的日子,否則取不到還原價。

    bench_closes 為大盤指數的日收盤價,用於 Beta。依日期對齊 ——
    標的與基準的交易日不必相同,取交集即可。空 dict 代表無基準資料,
    此時 Beta 為 None。
    """
    code = prices[0].code if prices else ""
    m = EtfMetrics(code=code)
    m.returns = {p.value: None for p in Period}
    m.annualized = {p.value: None for p in Period}
    m.excess = {p.value: None for p in Period}

    if not prices:
        return m

    by_date = {p.date: p for p in prices}
    own_days = sorted(d for d in by_date if d <= base_date)
    if not own_days:
        # 這檔在基準日當天或之前沒有任何資料。回傳全 None,
        # 不讓 max() 對空序列拋例外而中斷整批匯出。
        return m
    end = by_date[own_days[-1]]
    m.data_start = own_days[0]

    # 歷史沒有回溯到掛牌日時,「成立以來」這個標籤就是錯的。
    # Yahoo 的 0050 只到 2009,掛牌日是 2003-06-30 —— 用 2009 起算的數字
    # 冒充成立以來報酬,是規格 §4.3 明令禁止的那種安靜錯誤。
    inception_is_trustworthy = (
        listing_date is None
        or m.data_start <= listing_date + timedelta(days=INCEPTION_TOLERANCE_DAYS)
    )

    for period in Period:
        if period is Period.INCEPTION and not inception_is_trustworthy:
            continue  # 已預設為 None
        start_day = period_start(base_date, period, own_days)
        if start_day is None or start_day not in by_date:
            continue  # 已預設為 None
        start = by_date[start_day]
        ret = total_return(start.adj_close, end.adj_close)
        m.returns[period.value] = ret
        if period.annualize:
            m.annualized[period.value] = cagr(
                ret, years_between(start.date, end.date)
            )

        # 超額報酬:同一段期間內,標的報酬減大盤報酬(規格 §4.5b)。
        # 兩端都要查得到基準才算,否則留 None —— 不拿別的期間頂替。
        bench_start = _benchmark_at(bench_closes, start.date)
        bench_end = _benchmark_at(bench_closes, end.date)
        if bench_start is not None and bench_end is not None and bench_start > 0:
            m.excess[period.value] = ret - total_return(bench_start, bench_end)

    adj = [by_date[d].adj_close for d in own_days]
    if len(adj) >= MIN_DAYS_FOR_RISK:
        # 波動度取近一年窗口(見 VOLATILITY_WINDOW_DAYS)。
        # MDD 維持全歷史 —— 它問的是「這檔最慘曾經跌多少」,
        # 截成一年就回答不了那個問題。
        m.volatility = annualized_volatility(
            daily_returns(adj[-VOLATILITY_WINDOW_DAYS:]))
        m.mdd = max_drawdown(adj)
        if len(adj) >= MIN_DAYS_FOR_SHARPE:
            # 一年期不年化(Period.Y1.annualize is False),故年報酬取自 returns。
            # 分子與分母現在同為近一年窗口,而且兩者都顯示在畫面上 ——
            # 使用者能拿「一年」欄與「年化波動」欄自行驗算(規格 §7)。
            annual = m.returns[Period.Y1.value]
            if annual is not None:
                m.sharpe = sharpe(annual, m.volatility, risk_free)

            # Beta:與基準取日期交集後各自算日報酬,長度自然相等
            common = [d for d in own_days if d in bench_closes]
            if len(common) >= MIN_DAYS_FOR_SHARPE:
                m.beta = beta(
                    daily_returns([by_date[d].adj_close for d in common]),
                    daily_returns([bench_closes[d] for d in common]),
                )

    recent = [by_date[d] for d in own_days[-LIQUIDITY_WINDOW_DAYS:]]
    if recent:
        m.avg_volume = sum(r.volume for r in recent) / len(recent)
        m.avg_turnover = sum(r.volume * r.close for r in recent) / len(recent)

    latest_close = by_date[own_days[-1]].close if own_days else None
    if dividends and latest_close and latest_close > 0:
        cutoff = base_date - timedelta(days=DIVIDEND_YIELD_DAYS)
        paid = sum(d.amount for d in dividends if cutoff < d.ex_date <= base_date)
        # 有配息紀錄但這一年沒配 → 0 是正確答案(確實沒配)。
        # 完全沒有配息紀錄 → None(不知道),兩者不可混為一談。
        m.dividend_yield = paid / latest_close

    m.premium_discount, m.premium_low, m.premium_high, m.premium_days_ratio, \
        m.premium_sample = _premium_stats(navs, base_date)

    # 規模 = 已發行受益權單位數 × 每單位淨值。取基準日當天或之前最新的一筆。
    latest_nav = max((n for n in navs if n.date <= base_date),
                     key=lambda n: n.date, default=None)
    if latest_nav is not None and latest_nav.fund_size:
        m.fund_size = latest_nav.fund_size * latest_nav.nav

    return m


def _premium_stats(
    navs: Sequence[NavRecord], base_date: date
) -> tuple[float | None, float | None, float | None, float | None, int]:
    """折溢價統計。規格 §4.4:當日值、近 60 日區間、溢價天數佔比。

    當日折溢價與區間統計分開判定:剛開始累積時,今天的折溢價是已知的事實
    (今天的市價與淨值都在手上),但「經常不經常偏離」還無從回答。
    把兩者綁在一起會讓個股頁在頭二十個交易日連當日折溢價都顯示不出來,
    而那個數字明明是對的。
    """
    usable = [n for n in navs if n.date <= base_date and n.premium_discount is not None]
    if not usable:
        return None, None, None, None, 0

    usable.sort(key=lambda n: n.date)
    latest = usable[-1].premium_discount

    window = [n.premium_discount for n in usable[-PREMIUM_WINDOW_DAYS:]]
    if len(window) < MIN_DAYS_FOR_PREMIUM_STATS:
        return latest, None, None, None, len(window)

    # 嚴格大於 0 才算溢價。恰好等於 0 是「與淨值一致」,歸進溢價會讓
    # 佔比虛胖,而這個數字正是拿來判斷「這檔是不是長期溢價」的。
    premium_days = sum(1 for x in window if x > 0)
    return (latest, min(window), max(window), premium_days / len(window), len(window))
