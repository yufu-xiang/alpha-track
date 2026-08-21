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
