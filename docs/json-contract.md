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
      "premium_discount": null
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
| `risk.volatility` | `number \| null` | 年化波動度。最低樣本 60 個交易日。 |
| `risk.mdd` | `number \| null` | 最大回撤,**負數**。最低樣本 60 個交易日。 |
| `risk.sharpe` | `number \| null` | (一年報酬 − 無風險利率) ÷ 年化波動度。波動為零時 `null`。 |
| `risk.beta` | `number \| null` | 對加權報酬指數迴歸。與基準的日期交集不足一年時 `null`。 |
| `premium_discount` | `number \| null` | 折溢價率。**階段 1 一律為 `null`** —— 見下節。 |

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

### `premium_discount` 在階段 1 一律是 `null`

資料源勘查逐條檢查了 TWSE 與 TPEx 的兩份 swagger 索引(143 + 225 條路徑),
**沒有任何免費的官方端點提供集中式的 ETF 淨值**。折溢價算不出來就是 `null`,
不填替代值。整條管線(`NavRecord`、`navs` 資料表、`parse_twse_nav`、
本欄位、UI 欄位)都保留著,找到來源後只需改一個 adapter。

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

`meta.json` 是前端唯一能得知「資料是否健康」的來源。
**即使資料庫為空,`meta.json` 也一定會被寫出**,前端才有東西可以據以顯示錯誤狀態。
