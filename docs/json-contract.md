# 前後端 JSON 契約

> **這份文件是 pipeline 與網站之間的唯一契約。**
> 後端由 `pipeline/src/alpha_track/export.py` 產出,前端型別在
> `web/src/types.ts` 鏡像。**欄位改名是破壞性變更,兩邊必須同步修改。**
> 前端的契約測試以 `Object.keys(row).sort()` **全等**斷言,
> 多一個欄位或少一個欄位都會讓前端測試失敗 —— 這是刻意的。
>
> 本文件的範例**由實際程式產出**,不是手寫的:`rankings.json` 那段是拿
> `tests/fixtures/yahoo_0050_full_daily_period1_period2.json` 的真實 0050 歷史
> 跑完整條 parse → compute → export 得到的。

## 檔案

| 檔案 | 內容 | 產生者 |
|---|---|---|
| `web/public/data/rankings.json` | 全市場 ETF 的績效與風險指標 | `build_rankings` |
| `web/public/data/meta.json` | 資料健康狀態,驅動前端的警告列 | `build_meta` |
| `web/public/data/etf/{代號}.json` | 個股頁:完整價格序列、配息紀錄、基本資料(每檔 4–60 KB,**lazy load**) | `build_detail` |
| `web/public/data/benchmark.json` | 加權報酬指數序列,供個股頁疊加基準線(約 36 KB,全站共用) | `build_benchmark_series` |
| `web/public/data/recovery.json` | 不可向上游回補的歷史淨值,供 Actions cache 遺失時復原 | `build_recovery` |

### 為什麼價格序列用「起點 + 天數位移」

完整日期字串每點要 13 位元組。實測 0050 的 3081 點:物件陣列 93 KB、
平行陣列 63 KB、**日期位移 35 KB** —— 差近三倍,而全站有 351 檔。

```json
"series": {
  "start": "2014-01-02", "days": [0, 1, 4, 5],
  "adj":   [9.27, 9.16, 9.14, 9.15],
  "close": [8.34, 8.24, 8.23, 8.24]
}
```

`adj` 是**還原價**:走勢圖比的是含息報酬,用原始收盤價會讓高配息 ETF
看起來一路走跌。

`close` 是**未還原**收盤價。它不是 `adj` 的備份 ——「配息再投入 vs
不再投入」的比較非它不可:還原價本身就已假設配息再投入,拿它去算再投入
等於把配息算兩次,而且兩條線會完全重疊,看起來像程式壞了。

實測全站 354 檔匯出約 9.8 MB，其中 ETF 明細約 9.3 MB。每日更新只在陣列
尾端追加一筆,git 的 delta 壓縮下**單日只增加 40 KB**(實測),
一年約 9 MB —— 因此保留完整每日精度,不做降取樣。

### 配息為什麼有兩個金額欄位

```json
"dividends": [
  { "ex_date": "2024-01-17", "pay_date": null,
    "amount": 3.0, "amount_adj": 0.75, "scale_known": true }
]
```

`amount` 是**當時實際配的錢**,配息紀錄表顯示這個 —— 它要對得上使用者的
對帳單。`amount_adj` 是**換算到價格序列尺度**的金額。

兩者不是重複。價格序列來自 Yahoo,對歷史日期已經除以分割倍率;
配息金額沒有。任何「拿配息去買股」的計算都必須用 `amount_adj` ——
用 `amount` 不會報錯,只會安靜地錯:實測 0050 的股息再投入試算
因此**高估 155.6%**。

倍率由證交所公告的除權息前收盤價(TWT49U)與我方同期價格相除得到,
只接受乾淨的整數倍率(2,3,4,5,6,7,8,10)或其倒數。對不上就維持原值
並把 `scale_known` 設為 `false` —— 換算錯的數字看起來一樣合理,
寧可少換算也不要換算錯。

### 成分股是「前十大」,不是完整持股

```json
"holdings": {
  "year_month": "202607",
  "items": [{ "code": "2330", "name": "台積電", "weight": 0.6059 }]
}
```

來源是投信投顧公會的**月報**,每檔只公布前十大。實測 0050 的前十大
合計 **80.4%**,高股息型更低(0056 只有 40.9%)。

因此 `items` 的權重加總遠小於 1,任何以此計算的重疊度都是
**前十大之間**的重疊 —— 前端必須把這件事寫在數字旁邊,否則
「重疊 30%」會被讀成「這兩檔有三成一樣」。

`weight` 為 `null` 代表該筆的比例欄位缺值,計算時應**整筆略過**而非當成 0:
當成 0 會讓它靜靜地不參與重疊計算,結果看起來像「兩檔沒有共同持有它」。

## 兩條貫穿全域的規則

1. **`null` 一律代表「資料不足」,絕不以 `0` 頂替。**
   前端據此顯示「—」並把該列排到該欄排序的最末,不讓它以 0 參與比較。
2. **數值是未經格式化的原始 float。** 報酬與風險是**小數**不是百分比
   (`0.1834` = 18.34%),格式化是前端的責任。價格可能帶浮點尾數
   (如 `104.3499984741211`,來源以 float32 儲存),前端顯示時自行取位。

## `rankings.json`

```json
{
  "data_date": "2026-08-21",
  "etfs": [
    {
      "code": "0050",
      "name": "元大台灣50",
      "category": "市值型",
      "region": "台灣",
      "is_leveraged": false,
      "is_inverse": false,
      "close": 104.3499984741211,
      "listing_date": "2003-06-30",
      "data_start": "2014-01-02",
      "returns": {
        "D1": 0.012124151488845714,
        "W1": -0.019266945698860782,
        "M1": 0.018048765601181405,
        "M3": 0.09530502438324362,
        "M6": 0.35990920657066194,
        "YTD": 0.5902431169193563,
        "Y1": 1.047438016009322,
        "Y3": 2.635837851039474,
        "Y5": 2.690847820050511,
        "Y10": 7.250670892130257,
        "INCEPTION": null
      },
      "annualized": {
        "D1": null, "W1": null, "M1": null, "M3": null, "M6": null,
        "YTD": null, "Y1": null,
        "Y3": 0.5375368873566742,
        "Y5": 0.2983107877523332,
        "Y10": 0.23484174755041543,
        "INCEPTION": null
      },
      "risk": {
        "volatility": 0.19386010353434088,
        "mdd": -0.33827651165865,
        "sharpe": 5.3256858795932365,
        "beta": null
      },
      "premium_discount": -0.0031,
      "premium_low": null,
      "premium_high": null,
      "premium_days_ratio": null,
      "premium_sample": 1,
      "avg_volume": 18420000.0,
      "avg_turnover": 3601110000.0,
      "dividend_yield": 0.0231
    }
  ]
}
```

### 欄位

| 欄位 | 型別 | 說明 |
|---|---|---|
| `data_date` | `string` | 計算基準日,ISO `YYYY-MM-DD`。全市場共用一個。 |
| `code` | `string` | 證券代號。**字串**不是數字 —— `0050` 轉成數字會變成 `50`。 |
| `name` | `string` | 中文簡稱,來自 TWSE/TPEx 的每日行情。 |
| `category` | `string \| null` | 市值型 / 高股息 / 主題型 / 海外指數 / 產業型 / 因子型 / 債券型 / 槓桿型 / 反向型 / 未分類。 |
| `region` | `string \| null` | 台灣 / 美國 / …。判定不出時為 `null`。 |
| `is_leveraged`、`is_inverse` | `boolean` | 由代號結尾 `L` / `R` 判定。前端的預設篩選會排除這兩類。 |
| `close` | `number` | 基準日收盤價。 |
| `listing_date` | `string \| null` | **官方掛牌日**,取自 TWSE 的 ETF 靜態清單。 |
| `data_start` | `string \| null` | **實際持有資料的起點。** 見下節。 |
| `returns` | `Record<PeriodCode, number \| null>` | 各期間**含息**總報酬,小數。 |
| `annualized` | `Record<PeriodCode, number \| null>` | 年化報酬(CAGR)。**一年以內的期間一律 `null`** —— 把一週報酬年化會得到「年化 380%」這種誤導性數字。 |
| `excess` | `Record<PeriodCode, number \| null>` | **相對加權報酬指數的超額報酬**(規格 §4.5b)。同期間的標的報酬減大盤報酬,正值代表贏大盤。大盤資料自 2016-08 起,更早的期間為 `null`。注意基準是**台股**指數,用它衡量美債或海外 ETF 沒有意義。 |
| `risk.volatility` | `number \| null` | 年化波動度。最低樣本 60 個交易日。 |
| `risk.mdd` | `number \| null` | 最大回撤,**負數**。最低樣本 60 個交易日。 |
| `risk.sharpe` | `number \| null` | (一年報酬 − 無風險利率) ÷ 年化波動度。波動為零時 `null`。 |
| `risk.beta` | `number \| null` | 對加權報酬指數迴歸。與基準的日期交集不足一年時 `null`。 |
| `premium_discount` | `number \| null` | 基準日預估淨值的折溢價率。當日無淨值、無成交或驗證失敗時為 `null`。 |
| `avg_volume` | `number \| null` | 近 20 個交易日的平均成交**股數**。 |
| `avg_turnover` | `number \| null` | 近 20 個交易日的平均成交**金額**(股數 × 收盤價)。比較流動性要看金額:10 元與 100 元的 ETF 成交同樣股數,換手資金差十倍,只排成交量會讓低價 ETF 系統性看起來比較熱門。 |
| `premium_low` / `premium_high` | `number \| null` | 近 60 日折溢價的最低 / 最高值。樣本不足 20 個交易日時為 `null`。 |
| `premium_days_ratio` | `number \| null` | 近 60 日中折溢價**嚴格大於 0**(溢價)的天數佔比。恰好等於 0 是「與淨值一致」,不計入。 |
| `premium_sample` | `number` | 實際納入折溢價統計的天數。它讓「為什麼區間是空的」有答案 —— 淨值來源只有當日快照、沒有歷史,折溢價只能逐日累積。沒有它,使用者只會看到一個沒有原因的破折號。 |
| `dividend_yield` | `number \| null` | 近一年**實配**配息 ÷ 現價。不年化、不推估 —— 推估會把一次性特別配息當成常態,殖利率排行會被那種標的佔滿。無配息紀錄者為 `null`,不是 `0`:「沒有資料」與「這一年沒配」是兩件事。 |

### `PeriodCode`

固定十一個,順序即前端分頁的顯示順序:

```
D1  W1  M1  M3  M6  YTD  Y1  Y3  Y5  Y10  INCEPTION
```

`returns` 與 `annualized` **一定**含全部十一個鍵,資料不足的為 `null`。
前端可以安全地直接索引,不必先檢查鍵是否存在。

### `listing_date` 與 `data_start` 是兩件事

`listing_date` 是官方掛牌日;`data_start` 是**免費資料源實際涵蓋到的最早日期**。
兩者不同時,`INCEPTION` 會是 `null`,而 UI **必須用 `data_start` 說明原因** ——
否則使用者只會看到一個沒有理由的破折號。

上表的 0050 就是這個情況:掛牌於 2003-06-30,但 Yahoo 的歷史在
2014-01-02 有一次未調整的 1:4 分割,該日之前的區段與之後不同尺度,
合併計算得到的是錯的數字而不是較長的樣本,因此被捨棄
(見 `docs/data-sources.md` 的 Yahoo 段落與 1a ledger 的 R14 / R24)。
`Y5`、`Y10` 完全落在分割之後,不受影響。

### 折溢價是逐日累積的預估淨值

來源為 TWSE MIS 的收盤後 ETF 淨值揭露快照。它是當日最終的
**預估淨值**，不是各投信的盤後正式結算淨值；端點也沒有歷史查詢參數。
pipeline 因此每日寫入 SQLite 並在 `recovery.json` 保留可攜快照。
近 60 日統計需要至少 20 個樣本，未累積足夠時回傳 `null`，並用
`premium_sample` 告訴 UI 目前的實際涵蓋日數。

## `recovery.json`

```json
{
  "version": 1,
  "navs": [
    {"code":"0050","date":"2026-08-26","nav":104.2,
     "market_price":104.35,"fund_size":2369400000000.0}
  ]
}
```

快照只收錄無法重抓的 `navs`，價格、配息與大盤基準仍以上游回補。
`version` 不相符或任一列格式錯誤時，復原指令會直接失敗，不會猜測或部分匯入。

## `meta.json`

```json
{
  "generated_at": "2026-08-23T20:20:17+08:00",
  "data_date": "2026-08-21",
  "is_stale": false,
  "etf_count": 350,
  "unclassified": ["00999"],
  "anomalies": [
    {"code": "0056", "reason": "單日變動 +18.2% 超過門檻但當日無除息紀錄"}
  ],
  "risk_free_rate": 0.015
}
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `generated_at` | `string` | 產生時刻,ISO 8601 含台北時區偏移。 |
| `data_date` | `string` | 與 `rankings.json` 的同名欄位一致。 |
| `is_stale` | `boolean` | `true` 代表當日抓取被驗證閘門整批拒絕,畫面上是**前一日**的資料。前端須顯著警告。 |
| `etf_count` | `number` | 本次匯出的檔數。 |
| `unclassified` | `string[]` | 落入「未分類」的代號,提示維護者補 `config/etf_categories.yaml`。 |
| `anomalies` | `{code, reason}[]` | 已寫入但需人工檢查的列(如無除息卻單日暴漲)。 |
| `risk_free_rate` | `number` | Sharpe 用的無風險利率。前端須顯示在 Sharpe 欄位旁,使數字可被檢驗(規格 §4.5a)。 |
| `benchmark_return_1y` | `number \| null` | 加權報酬指數近一年漲幅。**不是健康狀態,是判讀基準** —— 大盤漲九成的年份,整張表的報酬與夏普值都會很誇張,沒有這個對照,使用者無從判斷「+99%」是這檔厲害還是全市場都在漲。無資料時為 `null`,前端整段不顯示(顯示破折號會被誤讀成「大盤沒漲」)。 |

`meta.json` 是前端唯一能得知「資料是否健康」的來源。
**即使資料庫為空,`meta.json` 也一定會被寫出**,前端才有東西可以據以顯示錯誤狀態。
