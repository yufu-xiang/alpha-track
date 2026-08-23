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
from .models import NavRecord, Period, PriceRecord
from .periods import period_start

MIN_DAYS_FOR_RISK = 60
"""規格 §4.4:少於此樣本數不計算波動度與最大回撤。"""

MIN_DAYS_FOR_SHARPE = 250
"""規格 §4.4:Sharpe 與 Beta 需至少一年樣本。"""

INCEPTION_TOLERANCE_DAYS = 30
"""最早資料日期與掛牌日相差在此天數內,才認可「成立以來」報酬。
免費資料源的起始日常與掛牌日差幾個交易日,不必因此整欄作廢。"""


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
    data_start: date | None = None
    """最早持有價格資料的日期。與掛牌日不同時,前端據此說明實際涵蓋範圍。"""


def compute_etf_metrics(
    prices: Sequence[PriceRecord],
    base_date: date,
    risk_free: float,
    bench_closes: Mapping[date, float],
    navs: Sequence[NavRecord],
    listing_date: date | None,
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

    adj = [by_date[d].adj_close for d in own_days]
    if len(adj) >= MIN_DAYS_FOR_RISK:
        m.volatility = annualized_volatility(daily_returns(adj))
        m.mdd = max_drawdown(adj)
        if len(adj) >= MIN_DAYS_FOR_SHARPE:
            # 一年期不年化(Period.Y1.annualize is False),故年報酬取自 returns。
            #
            # 分子是近一年報酬,分母是**全歷史**波動度,窗口刻意不同:
            # 規格 §7 要求使用者能拿畫面上的數字自行驗算 Sharpe,而畫面上的
            # 波動度欄位就是全歷史的這一個。改用近一年波動度會讓公式更純粹,
            # 卻使畫面上的三個數字對不起來 —— 可驗證性是規格明確選擇的取捨。
            # 前端的名詞說明需載明兩者的窗口(規格 §7 的「怎麼算」欄)。
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

    latest_nav = max((n for n in navs if n.date <= base_date),
                     key=lambda n: n.date, default=None)
    if latest_nav is not None:
        m.premium_discount = latest_nav.premium_discount

    return m
