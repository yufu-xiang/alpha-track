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

ETF_CODE_PREFIX = "00"
"""台股 ETF 的代號一律以 00 開頭(0050、006208、00679B、00400A)。

這道篩選是必要的,不是保險:每日行情端點回傳的是**全部**上市櫃證券
—— 實測 TWSE 1376 筆、TPEx 1011 筆,其中 ETF 只有 233 + 117 檔。
不篩就會把兩千多檔個股寫進資料庫並排進排行榜,而且它們全部是「未分類」。

同一個代號空間裡的鄰居都不是 ETF,已由實測樣本確認:
01xxxT 是不動產投資信託(如 01001T)、020xxx 是 ETN(如 020000、02001L)、
純四碼數字是個股(如 2330)。
"""


def is_etf_code(code: str) -> bool:
    """是否為 ETF 代號。見 ETF_CODE_PREFIX 的說明。"""
    return code.startswith(ETF_CODE_PREFIX)


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
    """判定單一 ETF 的分類。未知代號歸「未分類」,不拋出例外。

    分類與地區的來源刻意分開:
      - **分類**由代號規則(B/L/R)確定性判定,規則優先於對照表。
      - **地區**只能來自對照表 —— 代號決定不了它。元大美債20年(00679B)
        與元大台灣50正2(00631L)都靠規則分類,地區卻一個美國一個台灣。

    早期版本在三個規則分支直接 return,對照表整個沒查,於是這 143 檔的
    地區永遠是空的,而且就算把地區填進 YAML 也讀不到。
    """
    suffix = code[-1].upper() if code else ""
    entry = category_map.get(code) or {}
    region = entry.get("region")

    if suffix == "B":
        return Classification("債券型", region, False, False)
    if suffix == "L":
        return Classification("槓桿型", region, True, False)
    if suffix == "R":
        return Classification("反向型", region, False, True)

    if not entry:
        return Classification(UNCLASSIFIED, None, False, False)
    return Classification(
        category=entry.get("category", UNCLASSIFIED),
        region=region,
        is_leveraged=False,
        is_inverse=False,
    )
