from pathlib import Path

from alpha_track.categories import Classification, classify, load_category_map, is_etf_code

CATEGORY_MAP = {
    "0050": {"name": "元大台灣50", "category": "市值型", "region": "台灣"},
    "0056": {"name": "元大高股息", "category": "高股息", "region": "台灣"},
    "00662": {"name": "富邦NASDAQ", "category": "海外指數", "region": "美國"},
}


def test_suffix_b_is_bond_regardless_of_map():
    """代號結尾字母為官方規範,屬確定性規則,優先於人工對照表。"""
    c = classify("00679B", CATEGORY_MAP)
    assert c.category == "債券型"
    assert c.is_leveraged is False


def test_suffix_l_is_leveraged():
    c = classify("00631L", CATEGORY_MAP)
    assert c.category == "槓桿型"
    assert c.is_leveraged is True
    assert c.is_inverse is False


def test_suffix_r_is_inverse():
    c = classify("00632R", CATEGORY_MAP)
    assert c.category == "反向型"
    assert c.is_inverse is True
    assert c.is_leveraged is False


def test_known_code_uses_manual_map():
    c = classify("0050", CATEGORY_MAP)
    assert c.category == "市值型"
    assert c.region == "台灣"


def test_unknown_code_falls_back_to_unclassified():
    """規格 §3.2:未分類不使 pipeline 失敗,照常出現在總排行。"""
    c = classify("00999", CATEGORY_MAP)
    assert c.category == "未分類"
    assert c.region is None


def test_lowercase_suffix_is_handled():
    assert classify("00679b", CATEGORY_MAP).category == "債券型"


def test_load_category_map_reads_yaml(tmp_path: Path):
    f = tmp_path / "cats.yaml"
    f.write_text(
        "0050:\n"
        "  name: 元大台灣50\n"
        "  category: 市值型\n"
        "  region: 台灣\n",
        encoding="utf-8",
    )
    m = load_category_map(f)
    assert m["0050"]["category"] == "市值型"


def test_load_category_map_keeps_codes_as_written(tmp_path: Path):
    """YAML 1.1 會對前導零的代號做八進位解析,且行為極不一致:
        0050   → int 40      (八進位 0o50)
        0056   → int 46      (八進位 0o56)
        0058   → str '0058'  (含 8,不是合法八進位,反而保持字串)
        006208 → str '006208'
    同一份檔案三種行為,會讓分類表靜默錯亂到別的代號上。
    解法是完全關閉型別解析(BaseLoader),讓代號逐字保留。
    """
    f = tmp_path / "cats.yaml"
    f.write_text(
        "0050:\n  category: 市值型\n"
        "0056:\n  category: 高股息\n"
        "0058:\n  category: 產業型\n"
        "006208:\n  category: 市值型\n"
        "00679B:\n  category: 債券型\n",
        encoding="utf-8",
    )
    m = load_category_map(f)
    assert set(m) == {"0050", "0056", "0058", "006208", "00679B"}
    assert m["0050"]["category"] == "市值型"


def test_load_category_map_never_produces_a_numeric_key(tmp_path: Path):
    """守住回歸:任何一個鍵變成數字,就代表型別解析又被打開了。"""
    f = tmp_path / "cats.yaml"
    f.write_text("0050:\n  category: 市值型\n", encoding="utf-8")
    assert all(isinstance(k, str) for k in load_category_map(f))


def test_classification_is_a_dataclass_with_expected_fields():
    c = Classification(category="市值型", region="台灣",
                       is_leveraged=False, is_inverse=False)
    assert c.category == "市值型"


def test_etf_codes_are_recognised_by_their_prefix():
    """每日行情端點回傳的是全部上市櫃證券,不是只有 ETF。
    沒有這道篩選,排行榜上會出現 2000 多檔個股。"""
    for code in ("0050", "0056", "006208", "00679B", "00631L", "00400A"):
        assert is_etf_code(code), code


def test_non_etf_securities_are_excluded():
    """01xxxT 是 REIT、020xxx 是 ETN、四碼數字是個股 —— 都不是 ETF。"""
    for code in ("2330", "1101", "01001T", "020000", "02001L", ""):
        assert not is_etf_code(code), code
