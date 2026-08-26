/**
 * 手續費與交易稅。規格 §6.3。
 *
 * 規格明令「預設值須於實作時查證現行法規後寫入,不得憑記憶填寫」——
 * 稅率錯誤會使所有損益數字系統性偏差。以下數值於 2026-08-26 查證:
 *
 *   券商手續費   0.1425%,買賣皆收,多數券商最低 20 元
 *                電子下單折扣因券商與客戶而異(1 折到 6.5 折都有),
 *                故折扣預設 1(不打折),由使用者自行填入。
 *   股票證交稅   0.3%,僅賣出時收
 *   股票型 ETF   0.1%,僅賣出時收
 *   債券型 ETF   暫免徵,**至 2026-12-31 為止**
 *                但槓桿/反向的債券 ETF 仍課 0.1%
 *
 * 來源:富果客服中心、Money Daily、懶人經濟學、Money101(2026-08 查詢)
 */

/** 債券 ETF 證交稅暫免的截止日。到期後回到 0.1%。 */
export const BOND_ETF_TAX_EXEMPTION_UNTIL = '2026-12-31'

export const DEFAULT_FEE_CONFIG = {
  /** 法定手續費率 */
  commissionRate: 0.001425,
  /** 券商折扣。1 = 不打折;0.6 = 六折。因人而異,必須自己填。 */
  commissionDiscount: 1,
  /** 多數券商的整股最低手續費 */
  minCommission: 20,
}

export type FeeConfig = typeof DEFAULT_FEE_CONFIG

export interface TaxContext {
  category: string | null
  isLeveraged: boolean
  isInverse: boolean
  /** 交易日期,用來判斷債券 ETF 的免徵是否仍在有效期內 */
  date: string
}

/**
 * 賣出時的證交稅率。買進不課證交稅,故此函式只用於賣出。
 *
 * 債券 ETF 的免徵**有到期日**。寫死 0% 會在到期後的隔天靜默算錯每一筆
 * 賣出損益,而且沒有任何錯誤訊息 —— 所以這裡用日期判斷而不是常數。
 */
export function sellTaxRate(ctx: TaxContext): number {
  const isBondEtf = ctx.category === '債券型'
  if (isBondEtf) {
    // 槓桿與反向的債券 ETF 不在免徵範圍內
    if (ctx.isLeveraged || ctx.isInverse) return 0.001
    return ctx.date <= BOND_ETF_TAX_EXEMPTION_UNTIL ? 0 : 0.001
  }
  // 其餘 ETF 一律 0.1%(一般股票是 0.3%,但本站只追蹤 ETF)
  return 0.001
}

/** 單筆交易的手續費。買賣皆收,不低於最低收費。 */
export function commission(amount: number, cfg: FeeConfig): number {
  if (amount <= 0) return 0
  const raw = amount * cfg.commissionRate * cfg.commissionDiscount
  return Math.max(cfg.minCommission, Math.round(raw))
}
