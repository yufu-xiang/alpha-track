"""公會基金名稱 → ETF 代號的對應。

對不上不是小事:靜默丟掉會讓某幾檔的成分股永遠是空的,
而畫面上看起來只是「還沒抓到」;對錯了更糟 ——
把 A 基金的持股掛到 B 檔上,在畫面上完全看不出來。
"""
from alpha_track.fundnames import MANUAL, build_index, normalize, resolve


def test_normalize_bridges_the_two_naming_conventions():
    # TWSE 用「證券投資信託基金」,公會用「基金」
    assert normalize("元大台灣卓越50證券投資信託基金") == normalize("元大台灣卓越50基金")
    # 臺 / 台 混用
    assert normalize("元大臺灣價值高息ETF基金") == normalize("元大台灣價值高息ETF基金")
    # 括號註記整段移除
    assert normalize("元大台灣高股息基金(本基金之配息來源…)") == "元大台灣高股息基金"


def test_two_layer_index():
    twse = {"0050": "元大台灣卓越50證券投資信託基金"}
    ours = {"0050": "元大台灣50", "006201": "元大富櫃50"}
    index, collisions = build_index(twse, ours)
    assert collisions == []
    # 第一層:TWSE 全名
    assert resolve("元大台灣卓越50基金", index) == "0050"
    # 第二層:證券簡稱 +「基金」—— 公會的「元大富櫃50基金」對不上 TWSE 全名
    assert resolve("元大富櫃50基金", index) == "006201"


def test_manual_table_wins():
    """傘型子基金與命名差異太大的,規則湊不出來也不該硬湊。"""
    index, _ = build_index({}, {})
    assert resolve("元大台灣電子科技基金", index) == "0053"
    assert resolve("元大台灣金融基金", index) == "0055"
    assert resolve("元大標普500基金", index) == "00646"


def test_unresolved_returns_none_not_a_guess():
    index, _ = build_index({}, {})
    assert resolve("某某從未見過的基金", index) is None


def test_normalisation_collision_drops_both_rather_than_guessing():
    """正規化把兩檔不同的基金壓成同一個鍵時,取其一會把持股掛到錯的代號上。

    那在畫面上完全看不出來,所以兩邊都不要,並回報撞名的代號。
    """
    twse = {"AAA": "某某基金(美元)", "BBB": "某某基金(新台幣)"}
    index, collisions = build_index(twse, {})
    assert resolve("某某基金", index) is None
    assert set(collisions) == {"AAA", "BBB"}


def test_manual_entries_all_look_like_etf_codes():
    for name, code in MANUAL.items():
        assert code.startswith("00"), f"{name} 的代號 {code} 不像 ETF 代號"
