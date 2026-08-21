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
