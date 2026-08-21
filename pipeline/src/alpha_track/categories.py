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

    使用 BaseLoader 而非 safe_load:YAML 1.1 會對前導零的代號做八進位解析,
    而且行為不一致 —— 0050 變成 int 40、0056 變成 int 46,但 0058 因為含 8
    不是合法八進位字元反而保持字串。用 safe_load 再回頭補零救不回來
    (40 補成 "0040" 是別檔 ETF),整份分類表會靜默錯亂。

    BaseLoader 完全關閉型別解析,所有純量一律是字串,代號逐字保留。
    本檔的值也全是字串,不需要型別解析。
    """
    raw = yaml.load(path.read_text(encoding="utf-8"), Loader=yaml.BaseLoader) or {}
    return {str(key): (value or {}) for key, value in raw.items()}


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
