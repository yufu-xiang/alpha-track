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
