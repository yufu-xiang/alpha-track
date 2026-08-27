"""把公會的基金名稱對應到 ETF 代號。

公會的「基金投資明細」用**基金全名**,沒有證券代號;我方用代號。
兩邊的命名慣例不同,所以對應要分層做,而且**對不上的必須看得見** ——
靜默丟掉會讓某幾檔的成分股永遠是空的,而畫面上看起來只是「還沒抓到」。

## 三層

1. **TWSE 基金基本資料的中文全名**(`t187ap47_L`)。實測 45 檔中 36 檔命中。
2. **我方資料庫的證券簡稱 + 「基金」**。再多命中 4 檔 ——
   公會的「元大富櫃50基金」對得上簡稱「元大富櫃50」,但對不上 TWSE 的全名。
3. **人工對照表**(見 MANUAL)。剩下的 5 檔,全部是傘型子基金或命名差異太大,
   規則湊不出來也不該硬湊 —— 湊錯會把 A 基金的持股掛到 B 檔上,
   而那在畫面上完全看不出來。

實測合計:45 檔中 40 檔靠前兩層自動對上(89%),其餘由對照表補齊。
"""
from __future__ import annotations

import re

MANUAL: dict[str, str] = {
    # 傘型基金的子基金:TWSE 的全名是「元大台灣ETF傘型…之電子科技…」,
    # 與公會的短名結構完全不同,規則對不上。
    "元大台灣電子科技基金": "0053",
    "元大台灣金融基金": "0055",
    # 命名差異:公會用中文「標普」,證券簡稱用「S&P」。
    "元大標普500基金": "00646",
    # 公會用「單日正向2倍」,證券簡稱用「正2」。
    "元大台灣50單日正向2倍基金": "00631L",
    # 公會的「上櫃ESG 30」中間有空格且冠上公司全名。
    "中國信託上櫃ESG 30 ETF基金": "00928",
}

_PAREN = re.compile(r"[（(][^）)]*[）)]")
_REPLACEMENTS = (
    ("證券投資信託基金", "基金"),
    ("證券投資信託", ""),
    ("交易所交易基金", "ETF基金"),
    ("指數股票型基金", "ETF基金"),
    ("臺", "台"),
)


def normalize(name: str) -> str:
    """把兩邊的命名慣例拉到同一個形狀。

    括號整段移除:TWSE 與公會都會在名稱裡塞不同的括號註記
    (幣別、級別、配息來源說明),留著就對不上。這會讓「某某基金(美元)」
    與「某某基金」看起來相同 —— 目前的 ETF 清單裡沒有這種衝突,
    真的出現時會由 build_index 的重複檢查擋下來,不會靜默取其一。
    """
    s = _PAREN.sub("", name)
    for a, b in _REPLACEMENTS:
        s = s.replace(a, b)
    return re.sub(r"\s+", "", s)


def build_index(
    twse_full_names: dict[str, str],
    own_short_names: dict[str, str],
) -> tuple[dict[str, str], list[str]]:
    """建立「正規化名稱 → 代號」的索引。

    :param twse_full_names: 代號 → TWSE 基金中文全名
    :param own_short_names: 代號 → 我方資料庫的證券簡稱
    :returns: (索引, 因為正規化後撞名而未納入的代號)
    """
    index: dict[str, str] = {}
    collisions: list[str] = []

    def put(key: str, code: str) -> None:
        if not key:
            return
        existing = index.get(key)
        if existing is None:
            index[key] = code
        elif existing != code:
            # 撞名代表正規化把兩檔不同的基金壓成同一個鍵。取其一會把
            # 持股掛到錯的代號上,而那看不出來 —— 兩邊都不要。
            collisions.append(code)
            collisions.append(existing)
            index.pop(key, None)

    for code, full in twse_full_names.items():
        put(normalize(full), code)
    for code, short in own_short_names.items():
        if short:
            put(normalize(short) + "基金", code)

    return index, sorted(set(collisions))


def resolve(fund_name: str, index: dict[str, str]) -> str | None:
    """對應單一基金名稱。對不上回 None —— 呼叫端必須把它列出來。"""
    if fund_name in MANUAL:
        return MANUAL[fund_name]
    return index.get(normalize(fund_name))
