# 資料源實測記錄

> 本文件記錄實際呼叫結果,是 pipeline adapter 的欄位映射依據。
> 最後驗證日期:2026-08-21
> 產生方式:`python scripts/survey_sources.py`(部分端點另以獨立指令驗證,見各節說明),
> 原始回應存於 `pipeline/tests/fixtures/*.json`。

## 可用端點

### TWSE OpenAPI — 上市個股(含 ETF)每日收盤行情
- URL: `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`
- 方法: GET,無需金鑰
- 回應結構: `list[dict]`(實測 1376 筆,涵蓋當日所有上市證券,含 ETF,例如 `00400A` 主動國泰動能高息)
- Fixture: `pipeline/tests/fixtures/twse_stock_day_all.json`
- 欄位:
  | 欄位名 | 型別 | 範例值 | 對應 |
  |---|---|---|---|
  | Date | str | `"1150820"` | 民國年 YYYMMDD,無分隔符(115+08+20 = 2026-08-20) |
  | Code | str | `"0050"` | 證券代號 |
  | Name | str | `"元大台灣50"` | 證券簡稱 |
  | TradeVolume | str | `"25835565"` | 成交股數,純數字字串,**無千分位逗號** |
  | TradeValue | str | `"376454269"` | 成交金額,純數字字串 |
  | OpeningPrice / HighestPrice / LowestPrice / ClosingPrice | str | `"14.66"` | 純數字字串,可直接 `float()` |
  | Change | str | `"0.1500"` / `"-0.4300"` | **有負號但無正號**(實測:00400A 收盤跌破開盤,Change 仍為正,因 Change 是相對「前一交易日收盤」而非當日開盤;另有 303 筆負值樣本確認負號存在,如 0055 `Change="-0.4300"`) |
  | Transaction | str | `"5278"` | 成交筆數 |
- 注意事項:
  - 此端點**只回傳當天(最新交易日)全市場快照**,不支援日期參數,無法用來一次性回補歷史 —— 只適合「每日增量」抓取,歷史回補需另尋來源(見下方 Yahoo / FinMind)。
  - 本次抽查的單日樣本中**沒有出現** `"--"` 或空字串這類無成交表示法,故本文件**不確認**這類端點是否有無成交的特殊標記,留待後續遇到實際案例時補充,不可假設一定是 `"--"`。
  - 沒有分頁參數;此端點在單一 payload 內回傳所有上市證券(1376 筆)。

### TWSE OpenAPI — 每日收盤行情大盤統計(含各類指數,不含報酬指數)
- URL: `https://openapi.twse.com.tw/v1/exchangeReport/MI_INDEX`
- 方法: GET,無需金鑰
- 回應結構: `list[dict]`(273 筆,當日快照,涵蓋「發行量加權股價指數」「寶島股價指數」等,**不含報酬指數**)
- Fixture: `pipeline/tests/fixtures/twse_mi_index.json`
- 欄位(中文鍵名):`日期`、`指數`、`收盤指數`、`漲跌`(`"+"`/`"-"` 符號欄,與數字分開)、`漲跌點數`、`漲跌百分比`、`特殊處理註記`
- 注意事項:此端點的用途是核對「發行量加權股價指數」(不含息),**不能誤用為加權報酬指數**;兩者名稱只差兩字,容易混淆。

### TWSE OpenAPI — 加權報酬指數(含息,近期滾動)
- URL: `https://openapi.twse.com.tw/v1/indicesReport/MFI94U`
- 方法: GET,無需金鑰,**無日期參數**
- 回應結構: `list[dict]`,實測固定回傳 14 筆(2026-08-03 ~ 2026-08-20,即當月至今的交易日)
- Fixture: `pipeline/tests/fixtures/twse_taiex_total_return.json`
- 欄位:
  | 欄位名 | 型別 | 範例值 | 說明 |
  |---|---|---|---|
  | Date | str | `"1150820"` | 民國年 YYYMMDD 無分隔符,與 STOCK_DAY_ALL 同格式 |
  | TAIEXTotalReturnIndex | str | `"103710.33"` | 純數字字串,無千分位逗號 |
- 注意事項:**此 openapi 版本只回傳「當月至今」的滾動資料,不支援任何回溯查詢**,不能滿足十年期報酬計算所需的歷史深度。歷史資料需改用下方的 TWSE 舊站端點。

### TWSE 舊站(rwd)— 加權報酬指數歷史查詢(逐月)
- URL 樣式: `https://www.twse.com.tw/rwd/zh/TAIEX/MFI94U?date=YYYYMMDD&response=json`
  (`date` 參數可為當月任一天,西元年月日;回傳「該月」整月資料)
- 方法: GET,無需金鑰;經瀏覽器實測與 `www.twse.com.tw/indicesReport/MFI94U?...` 完全同義(同一伺服器兩個路徑別名)
- 回應結構: `dict`,`data` 為 `list[list[str, str]]`(**不是 list[dict]**,是二維陣列,需搭配 `fields` 手動對應欄位)
- Fixtures:
  - `pipeline/tests/fixtures/twse_taiex_total_return_legacy_2020.json`(`date=20200102`)
  - `pipeline/tests/fixtures/twse_taiex_total_return_legacy_earliest.json`(`date=20030101`,驗證最早可得月份)
  - `pipeline/tests/fixtures/twse_taiex_total_return_legacy_out_of_range.json`(`date=20021201`,驗證超出範圍時的錯誤回應)
- 欄位(`fields` 陣列給出,中文欄名):
  | 位置 | 欄位名 | 型別 | 範例值 | 注意事項 |
  |---|---|---|---|---|
  | data[i][0] | 日　期(注意:兩字間有全形空格) | str | `" 92/01/02"`(注意開頭可能有空格) | 民國年,斜線分隔,**與 openapi 版本的無分隔格式不同** |
  | data[i][1] | 發行量加權股價報酬指數 | str | `"4,524.92"` | **含千分位逗號**,需先 `.replace(",", "")` 再轉 float |
- 成功回應範例:`{"stat":"OK","title":"92年01月 發行量加權股價報酬指數","date":"20030101","fields":[...],"data":[[...]]}`
- 超出範圍回應範例(**已實測確認**):`{"stat":"查詢日期小於92年1月，請重新查詢!","total":0}`(HTTP 200,靠 `stat` 文字判斷失敗,不是靠 HTTP status code)
- 注意事項:**這是回補「加權報酬指數」十年期歷史唯一驗證可行的免費來源**,但一次呼叫只回傳一個月,回補十年需約 120 次呼叫(逐月),務必加入延遲與快取。

### TWSE 舊站(rwd)— ETF 靜態清單(上市日期、發行人、追蹤指數)
- URL: `https://www.twse.com.tw/rwd/zh/ETF/list`
- 方法: GET,無需金鑰
- 回應結構: `dict`,`data` 為 `list[list[str]]`,`fields` 給出欄名(共 232 筆,即目前所有上市 ETF)
- Fixture: `pipeline/tests/fixtures/twse_etf_list.json`
- 欄位(`fields`):`上市日期`(格式 `"2003.06.30"`,句點分隔**西元年**,與其他端點的民國年不同)、`證券代號`、`證券簡稱`、`發行人`、`標的指數`
- 注意事項:此端點**只有靜態基本資料,不含價格或淨值**,但對驗證「0050 上市日 = 2003-06-30」很關鍵(見下方歷史回溯深度判定)。

### TPEx OpenAPI — 上櫃股票(含 ETF)收盤行情 — 建議採用
- URL: `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes`
- 方法: GET,無需金鑰
- 回應結構: `list[dict]`,實測 1011 筆(當日全部上櫃證券,含 117 檔 ETF,如 `00679B` 元大美債20年)
- Fixture: `pipeline/tests/fixtures/tpex_mainboard_quotes.json`
- 欄位:
  | 欄位名 | 型別 | 範例值 | 說明 |
  |---|---|---|---|
  | Date | str | `"1150820"` | 民國年 YYYMMDD 無分隔符,同 TWSE openapi 格式 |
  | SecuritiesCompanyCode | str | `"00679B"` | 證券代號 |
  | CompanyName | str | `"元大美債20年"` | 證券簡稱 |
  | Close / Open / High / Low | str | `"26.36"` | 純數字字串 |
  | Change | str | `"+0.38"` | **有正負號**(與 TWSE STOCK_DAY_ALL 不同,TWSE 正值無符號、TPEx 正值有 `+`) |
  | TradingShares | str | `"24166000"` | 無千分位逗號 |
  | TransactionAmount / TransactionNumber | str | 見上 | |
  | LatestBidPrice / LatesAskPrice | str | `"26.36"` | 注意 `LatesAskPrice` 少一個 t,是官方原始拼字,非筆誤 |
  | Capitals | str | `"6251692000"` | 發行股數 |
  | NextLimitUp / NextLimitDown | str | `"9999.95"` / `"0.01"` | |
- 注意事項:同樣是**當日快照**,無日期參數,無法回補歷史。

### TPEx OpenAPI — 上櫃股票行情(全量,含債券/權證,不建議作為 ETF 主要來源)
- URL: `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes`
- 回應結構: `list[dict]`,實測 **10634 筆**(同一天,但涵蓋範圍遠大於 `tpex_mainboard_quotes`,額外含大量債券代碼),欄位與上者幾乎相同,多了 `Average`(均價)、`NextReferencePrice`(次日參考價)
- Fixture: `pipeline/tests/fixtures/tpex_mainboard_daily_close_quotes.json`(**已裁剪**:僅保留含已知 ETF 代碼 `006201`/`00679B`/`00687B` 的列 + 前 30 筆,原始回應 4.15MB / 10634 筆,完整結構已由裁剪樣本充分呈現)
- 注意事項:兩個上櫃端點回傳的 117 檔 ETF 代碼集合相同,**建議 adapter 直接用體積小 10 倍的 `tpex_mainboard_quotes`**,除非明確需要 `Average`/`NextReferencePrice` 欄位。

### TPEx OpenAPI — 櫃買指數與報酬指數(近期滾動)
- URL: `https://www.tpex.org.tw/openapi/v1/tpex_reward_index`
- 方法: GET,無需金鑰,無日期參數
- 回應結構: `list[dict]`,實測固定回傳 14 筆(近期滾動,同 TWSE 的 MFI94U 行為模式)
- Fixture: `pipeline/tests/fixtures/tpex_reward_index.json`
- 欄位: `Date`(民國年 YYYMMDD 無分隔符)、`TPExIndex`(櫃買指數,不含息)、`TPExTotalReturnIndex`(櫃買報酬指數,含息)
- 注意事項:與 TWSE 加權報酬指數同樣的限制 —— 只有近期滾動資料;**本次勘查未找到、也未測試 TPEx 對應的逐月歷史查詢端點**(TWSE 有 `rwd/zh/TAIEX/MFI94U`,TPEx 目前找不到對應的舊站別名),列為待確認項,見「對規格的影響」。

### Yahoo Finance Chart API — 收盤價與還原股價(adjclose)
- URL 樣式: `https://query1.finance.yahoo.com/v8/finance/chart/{代號}.{TW|TWO}?period1={unix}&period2={unix}&interval=1d&events=div`
  - 上市證券代號後綴 `.TW`(實測 `0050.TW` 成功,`exchangeName: "TAI"`)
  - 上櫃證券代號後綴 `.TWO`(實測 `00679B.TWO` 成功,`exchangeName: "TWO"`;反之用 `00679B.TW` 呼叫回 **HTTP 404**,`{"code":"Not Found","description":"No data found, symbol may be delisted"}` —— 後綴用錯會乾淨地 404,不會混雜到別檔資料,便於偵錯)
- 方法: GET,無需金鑰,無 header 也可用(但建議帶 User-Agent)
- Fixtures:
  - `pipeline/tests/fixtures/yahoo_0050_range_max_interval_1d.json`(brief 建議的呼叫方式,**有陷阱,見下**)
  - `pipeline/tests/fixtures/yahoo_0050_full_daily_period1_period2.json`(正確的全歷史逐日呼叫方式)
  - `pipeline/tests/fixtures/yahoo_00679B_two_suffix_check.json`(驗證 `.TWO` 後綴)
- 回應結構: `dict`,`chart.result[0]` 下含 `meta`、`timestamp`(unix 秒陣列)、`indicators.quote[0]`(`open`/`high`/`low`/`close`/`volume`,皆為 **float/int 陣列,非字串**)、`indicators.adjclose[0].adjclose`(float 陣列)、`events.dividends`(以 unix timestamp 字串為 key 的 dict,每筆含 `amount` 與 `date`)
- 欄位:
  | 欄位路徑 | 型別 | 範例值 | 說明 |
  |---|---|---|---|
  | timestamp[i] | int | `1230739200` | UTC unix 秒,需轉時區(`meta.gmtoffset`/`meta.timezone` 為 `Asia/Taipei`,+8) |
  | indicators.quote[0].close[i] | float | `104.5` | 原始收盤價,**非字串**,可能為 `null`(遇非交易日或資料缺失) |
  | indicators.adjclose[0].adjclose[i] | float | `20.34...` | 還原收盤價,對舊日期會**低於** close(符合股利回溯調整邏輯);對最新一筆會等於 close |
  | events.dividends.{ts}.amount | float | `1.35` | 每股配息金額 |
  | meta.firstTradeDate | int (unix) | `1230771600` | 該代號在 Yahoo 資料庫中的**實際最早資料日期**,務必先讀這個欄位再決定回補起點 |
- **關鍵陷阱(務必寫入 adapter 實作說明)**:brief 範例的呼叫方式 `range=max&interval=1d` 對 `0050.TW` 這類長歷史標的,Yahoo 會**靜默降頻**為月線 —— 回應 `meta.dataGranularity` 變成 `"1mo"`,`timestamp` 只有 213 筆(每月一筆),而不是逐日資料。HTTP 狀態碼仍是 200,不會報錯,非常容易被忽略。**正確作法是用 `period1=0&period2=9999999999&interval=1d` 明確指定區間**,才能拿到真正逐日資料(實測 0050.TW 得到 4322 筆逐日資料,`dataGranularity="1d"`)。
- 注意事項:
  - `close` 與 `adjclose` **確認是兩個不同欄位**,數值也确实不同(見判定 A)。
  - `volume` 陣列的第一筆有時是 `0`(實測 0050.TW 第一筆 `volume=0`),為資料邊界的正常現象,非錯誤。

### FinMind — 股利資料(TaiwanStockDividend)
- URL: `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockDividend&data_id=0050&start_date=2015-01-01`
- 方法: GET,**免費層可用,無需 token**
- 回應結構: `dict`,`{"msg":"success","status":200,"data":[...]}`,`data` 為 `list[dict]`
- Fixture: `pipeline/tests/fixtures/finmind_dividend.json`
- 欄位(節錄):`date`(str,西元 `"2015-11-01"`)、`stock_id`、`year`(str,民國年如 `"104"`)、`CashEarningsDistribution`(float,現金股利)、`CashExDividendTradingDate`(str,除息交易日)、`CashDividendPaymentDate`(str,發放日)等約 19 個欄位,數值型欄位皆為 **float(非字串)**。
- 注意事項:回應層級 `status`/`msg` 與 HTTP status 分離,需同時檢查兩者。

### FinMind — 原始收盤價(TaiwanStockPrice)— 免費層可回溯至上市日
- URL: `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=0050&start_date=2003-01-01&end_date=2003-12-31`
- 方法: GET,免費層可用
- 回應結構: 同上,`data` 為 `list[dict]`
- Fixture: `pipeline/tests/fixtures/finmind_price_0050_2003.json`
- 欄位:`date`(西元 `"2003-06-30"`)、`stock_id`、`Trading_Volume`(int)、`Trading_money`(int)、`open`/`max`/`min`/`close`(float)、`spread`(float,漲跌)、`Trading_turnover`(int,成交筆數)
- 注意事項:**實測 0050 最早一筆資料就是 2003-06-30**(其上市首日),與 Yahoo 只能到 2009-01-02 形成明顯落差(見判定 B)。此資料集只有原始收盤價,**沒有還原價欄位**。

### FinMind — 還原股價(TaiwanStockPriceAdj)— 需付費層級
- URL: `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPriceAdj&data_id=0050&start_date=2003-01-01`
- 方法: GET
- **回應: HTTP 400**,`{"msg":"Your level is free. Please update your user level. ...","status":400,"token_tail":""}`
- Fixture: `pipeline/tests/fixtures/finmind_price_adj_free_tier_check.json`
- 注意事項:免費層**無法取得** FinMind 的還原股價資料集,只能用 `TaiwanStockPrice`(原始價)+ `TaiwanStockDividend`(股利)自行計算還原價,或改用 Yahoo(但 Yahoo 對 0050 只回溯到 2009)。

## 不可用端點 / 已排除

| 端點 | 失敗原因 / 排除理由 | 驗證日期 |
|---|---|---|
| ETF 每日淨值與折溢價(遍尋 TWSE openapi、TPEx openapi) | 兩份 swagger 索引(143 / 225 條路徑)逐條檢查,**沒有任何路徑同時具備「ETF」與「淨值」語意**;TPEx `tpex_opfund_latest`(開放式基金當日行情)雖有 `PreNAV`/`EstimatedNAV` 欄位,但實測只回傳 3 筆「上櫃受益憑證」(如 `T1001Y` 富邦FB),屬於興櫃受益憑證,非一般 ETF,且 `EstimatedNAV` 欄位曾實測回傳一個 URL 字串而非數字,資料品質不可靠,判定不適用 | 2026-08-21 |
| ETF 淨值揭露頁面(TWSE MIS)`mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf`、`.../value-disclosure-etf` | 以瀏覽器實際載入頁面並追蹤 Network 請求,兩頁背後實際呼叫的是同一份即時報價快照 `mis.twse.com.tw/stock/data/all_etf.txt`(依發行人分組,`refURL` 指向各投信自家的「預估淨值」頁面,如 `https://www.jkoam.com/etf/predict`);此為**盤中即時報價**,非官方 EOD 淨值封存資料,且沒有統一欄位格式(淨值揭露實際委由各投信自行網站呈現) | 2026-08-21 |
| `https://www.sitca.org.tw/ROC/Industry/IN2328.aspx`(投信投顧公會,猜測路徑) | HTTP 200 但回傳「網頁不存在」的自訂 404 頁面;僅為初步嘗試,**未進一步找出投信投顧公會正確的 ETF 淨值查詢路徑**,列為待確認項而非確認不可得 | 2026-08-21 |
| TPEx 報酬指數逐月歷史查詢端點 | 未找到 TWSE `rwd/zh/TAIEX/MFI94U` 對應的 TPEx 舊站別名;僅測試了 TPEx openapi 版本(`tpex_reward_index`,只有 14 天滾動),**未窮盡搜尋**,列為待確認項 | 2026-08-21 |
| `twse_etf_report`(`ETFReport/ETFRank`) | 端點本身可用(HTTP 200,20 筆),但內容是「定期定額交易戶數統計排行月報表」(ETF 與其成分股的定期定額開戶數排行),與收盤價/淨值/報酬指數皆無關,判定對本專案四類需求皆不適用 | 2026-08-21 |

## 歷史回溯深度

| 來源 | 最早可得日期(以 0050 為例) | 驗證方式 |
|---|---|---|
| TWSE 靜態 ETF 清單(`rwd/zh/ETF/list`) | 0050 上市日 = 2003-06-30 | 直接讀取 `上市日期` 欄位 |
| FinMind `TaiwanStockPrice`(免費層,原始收盤價) | 2003-06-30(與上市日一致) | 呼叫 `start_date=2003-01-01&end_date=2003-12-31`,第一筆即為 `2003-06-30` |
| TWSE 舊站報酬指數(`rwd/zh/TAIEX/MFI94U`) | 92 年 1 月(西元 2003 年 1 月) | `date=20030101` 成功回傳;`date=20021201` 回傳 `"查詢日期小於92年1月，請重新查詢!"` |
| **Yahoo `0050.TW` 逐日資料(close/adjclose)** | **2009-01-02**(**非** 規格預期的 2003 年) | `meta.firstTradeDate=1230771600`(UTC 2009-01-01 17:00,對應台北時區 2009-01-02);以 `period1=0&period2=9999999999&interval=1d` 實測得 4322 筆逐日資料,第一筆時間戳對應 2009-01-02 |
| FinMind `TaiwanStockPriceAdj`(還原價) | 無法驗證(免費層 HTTP 400,不可用) | 見上方「不可用端點」 |

**重點結論(判定 B)**:0050 實際上市於 2003-06-30,但 Yahoo Finance 對 `0050.TW` 的資料庫**只回溯到 2009-01-02**,中間缺了約 5 年半。這與規格「預期約 2003 年」的假設**不符**,詳見下方「對規格的影響」。

## 限流政策

| 來源 | 實測限制 | 因應方式 |
|---|---|---|
| openapi.twse.com.tw / www.tpex.org.tw(openapi 與舊站 rwd) | 本次勘查約 20 次請求,間隔 1.5 秒,**全程未遇 429 或明顯限流**;未壓測真正上限 | 維持逐一請求 + 間隔,回補大量歷史(如逐月報酬指數)時建議間隔 ≥1 秒並對失敗做重試退避 |
| Yahoo Finance chart API | 未使用金鑰;未刻意壓測速率上限;唯一觀察到的「異常」是 `range=max` 對長歷史標的的自動降頻(屬於功能特性,非限流) | 建議帶 User-Agent header;大量標的批次回補時仍應加入間隔,避免被暫時封鎖(本次未觸發但未驗證安全上限) |
| FinMind api v4 | 免費層無需 token 即可用部分 dataset(`TaiwanStockDividend`、`TaiwanStockPrice`);**dataset 層級限制**是實測到的唯一限制:`TaiwanStockPriceAdj` 免費層直接 HTTP 400,訊息明確要求升級付費層級;未見速率限制回應標頭 | 若需要還原價且不接受 Yahoo 的深度限制,需評估付費升級 FinMind,或改用「FinMind 原始價 + TaiwanStockDividend 自算還原價」的替代方案(此為設計決策,留給後續任務) |

## 對規格的影響

以下項目與規格 §3 的假設有落差,建議規格作者在 Task 8 之前先行決定,而非留給 adapter 實作者臨場處理:

1. **(判定 A)Yahoo 提供 adjclose,含息報酬計算鏈不需重新設計。** 實測確認 `close` 與 `adjclose` 是不同陣列,且數值符合「舊日期還原價 < 原始收盤價」的股利回溯調整邏輯。§4.1 的做法可以照原規劃進行。

2. **(判定 B)Yahoo 歷史深度不如規格預期,「十年期報酬」沒問題,但「自成立日起」的報酬無法只靠 Yahoo 算。** `0050.TW` 在 Yahoo 只回溯到 2009-01-02,而非上市日 2003-06-30。十年期報酬(2016 年至今)可正常計算;若規格有任何「自成立日」或涵蓋 2003–2009 的報酬需求,Yahoo 無法覆蓋這段,需要額外決策(例如接受此缺口、改用 FinMind 原始價自算還原價、或限縮報酬指標的最長回溯年限為 2009 年起)。**建議規格明確寫下「Yahoo 還原價歷史深度需先讀 `firstTradeDate` 動態判斷,不可假設等於上市日」。**

3. **Yahoo 的 `range=max&interval=1d` 呼叫方式有陷阱,brief 原始範例會拿到錯誤粒度的資料。** 對長歷史標的,Yahoo 會靜默把 `interval=1d` 降頻為月線(HTTP 200,不報錯,只有 `meta.dataGranularity` 變成 `"1mo"`)。Task 8 的 adapter **必須改用 `period1`/`period2`(unix timestamp)搭配 `interval=1d`**,否則會在生產環境不知不覺地把逐日資料存成月資料。

4. **ETF 每日淨值與折溢價,沒有找到任何官方免費集中式 API。** TWSE、TPEx 的 openapi 與已知舊站路徑都不提供;TWSE MIS 的「淨值揭露」頁面實際上是把使用者導向各投信自己的預估淨值頁面(格式不一,如 `jkoam.com/etf/predict`),不是官方 EOD 封存資料。**這是規格層級需要做決定的落差**:是否接受「折溢價排行」功能暫時無法實作、改為逐一爬取各投信網站(工程成本高且格式不統一)、或尋找付費資料源。本次勘查在時間範圍內**未能窮盡所有可能來源**(例如投信投顧公會 SITCA 的正確路徑仍未找到),但已確認「沒有一個現成的、統一格式的免費 API」這個結論。

5. **加權報酬指數的 openapi 版本只有近期滾動資料,回補歷史需改用舊站逐月端點。** 若規格或 Task 8 的設計假設 `indicesReport/MFI94U`(openapi 版)可以做歷史回補,這個假設不成立;必須改用 `rwd/zh/TAIEX/MFI94U?date=YYYYMMDD`,且要逐月呼叫(回補十年約需 120 次呼叫)。TPEx 對應的櫃買報酬指數目前**只驗證了 openapi 版本(同樣只有 14 天滾動)**,未找到、也未測試對應的逐月歷史端點,是本次勘查未窮盡的部分。

6. **日期格式在不同端點間不一致,parser 需要分別處理三種格式:**
   - openapi(TWSE 與 TPEx 皆同):民國年 `YYYMMDD`,無分隔符,如 `"1150820"`。
   - TWSE 舊站(`rwd/zh/TAIEX/...`):民國年 `YYY/MM/DD`,斜線分隔,可能含前導空格,如 `" 92/01/02"`。
   - TWSE 舊站 ETF 清單:**西元年** `YYYY.MM.DD`,句點分隔,如 `"2003.06.30"`(與其他 TWSE 端點都不同,容易誤判)。
   - FinMind、Yahoo(轉換後):西元年 `YYYY-MM-DD` 或 unix timestamp。

7. **數字字串的千分位逗號規則因端點而異:** openapi(TWSE、TPEx)一律不含千分位逗號;TWSE 舊站(`rwd`)**含**千分位逗號,需要先去除逗號才能轉數值。混用不同端點時容易漏掉這個轉換。

8. **上市/上櫃在 Yahoo 的代號後綴規則已驗證:** 上市 `.TW`,上櫃 `.TWO`(注意不是 `.TWO` 常見誤寫的 `.TPE` 或 `.OTC`);用錯後綴會乾淨地回 HTTP 404,便於在 adapter 中偵測設定錯誤。
