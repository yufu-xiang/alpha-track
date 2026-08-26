/**
 * 新增交易。規格 §6.6。
 *
 * 手續費與交易稅**自動試算但可覆寫** —— 券商折扣因人而異、實際扣款可能
 * 有零頭差異,而規格 §6.3 說得很清楚:稅率錯誤會使所有損益系統性偏差。
 * 自動填是省事,可覆寫是誠實。
 */
import { useEffect, useState } from 'react'
import { commission, sellTaxRate, type FeeConfig } from '../lib/fees'
import type { Transaction, TxType } from '../lib/portfolio'
import type { EtfRow } from '../types'

interface Props {
  fees: FeeConfig
  rows: EtfRow[]
  onAdd: (tx: Transaction) => void
}

export function TransactionForm({ fees, rows, onAdd }: Props) {
  const [type, setType] = useState<TxType>('buy')
  const [code, setCode] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [fee, setFee] = useState('')
  const [tax, setTax] = useState('')
  const [touched, setTouched] = useState({ fee: false, tax: false })

  const nShares = Number(shares) || 0
  const nPrice = Number(price) || 0
  const amount = nShares * nPrice
  const row = rows.find((r) => r.code === code.toUpperCase())

  // 使用者手動改過就不再覆蓋 —— 自動試算不該把人打的字吃掉
  useEffect(() => {
    if (touched.fee) return
    setFee(type === 'dividend' ? '0' : String(commission(amount, fees)))
  }, [amount, type, fees, touched.fee])

  useEffect(() => {
    if (touched.tax) return
    if (type !== 'sell' || !row) { setTax('0'); return }
    const rate = sellTaxRate({
      category: row.category, isLeveraged: row.is_leveraged,
      isInverse: row.is_inverse, date,
    })
    setTax(String(Math.round(amount * rate)))
  }, [amount, type, row, date, touched.tax])

  const valid = code.trim() !== '' && nShares > 0 && nPrice > 0 && date !== ''

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    onAdd({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type, code: code.toUpperCase().trim(), date,
      shares: nShares, price: nPrice,
      fee: Number(fee) || 0, tax: Number(tax) || 0,
    })
    setShares(''); setPrice('')
    setTouched({ fee: false, tax: false })
  }

  return (
    <form className="tx-form" onSubmit={submit}>
      <label>類型
        <select value={type} onChange={(e) => setType(e.target.value as TxType)}>
          <option value="buy">買進</option>
          <option value="sell">賣出</option>
          <option value="dividend">配息</option>
        </select>
      </label>
      <label>代號
        <input value={code} onChange={(e) => setCode(e.target.value)}
               list="etf-codes" placeholder="0050" required />
      </label>
      <datalist id="etf-codes">
        {rows.slice(0, 400).map((r) => (
          <option key={r.code} value={r.code}>{r.name}</option>
        ))}
      </datalist>
      <label>日期
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>{type === 'dividend' ? '配息股數' : '股數'}
        <input type="number" min="1" step="1" value={shares}
               onChange={(e) => setShares(e.target.value)} required />
      </label>
      <label>{type === 'dividend' ? '每股配息' : '價格'}
        <input type="number" min="0" step="0.001" value={price}
               onChange={(e) => setPrice(e.target.value)} required />
      </label>
      <label>手續費
        <input type="number" min="0" step="1" value={fee}
               onChange={(e) => { setFee(e.target.value); setTouched((t) => ({ ...t, fee: true })) }} />
      </label>
      <label>交易稅
        <input type="number" min="0" step="1" value={tax}
               onChange={(e) => { setTax(e.target.value); setTouched((t) => ({ ...t, tax: true })) }} />
      </label>
      <button type="submit" disabled={!valid}>新增</button>
    </form>
  )
}
