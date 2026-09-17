from alpha_track.sources.sitca_fees import parse_sitca_expenses


def test_annual_total_fee_ratio_uses_last_column_and_etf_rows_only():
    etf = ["AH11", "98764389", "元大台灣卓越50基金"] + ["0"] * 14 + ["1,424,925,319", "0.22%"]
    link = ["AK1", "75970963", "元大台灣卓越50ETF連結基金"] + ["0"] * 14 + ["100", "0.01%"]
    page = "<table><tr><th>交易直接成本</th><th>會計帳列之費用</th></tr>" + "".join(
        "<tr>" + "".join(f"<td>{value}</td>" for value in row) + "</tr>"
        for row in (etf, link)
    ) + "</table>"
    rows = parse_sitca_expenses(page, 2025)
    assert len(rows) == 1
    assert rows[0].fund_id == "98764389"
    assert rows[0].year == 2025
    assert rows[0].ratio == 0.0022
