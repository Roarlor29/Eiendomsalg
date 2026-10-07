import { useState } from 'react'

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const nf = new Intl.NumberFormat('nb-NO')

// «|| 0» gjør at -0 vises som 0
export const kr = (n) => (Math.round(Number.isFinite(n) ? n : 0) || 0).toLocaleString('nb-NO').replace('-', '−') + ' kr'
export const krShort = (n) => (Math.round(Number.isFinite(n) ? n : 0) || 0).toLocaleString('nb-NO').replace('-', '−')
export const pct = (n, d = 1) => (n * 100).toFixed(d).replace('.', ',') + ' %'

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-note">{hint}</span>}
    </label>
  )
}

// Beløp i hele kroner. Viser tusenskille når feltet ikke er i fokus.
// value: tall eller '' (tomt). onChange får tall, eller '' når feltet tømmes.
export function MoneyInput({ value, onChange, placeholder, allowEmpty = false, label }) {
  const [focused, setFocused] = useState(false)
  const raw = isNum(value) ? String(Math.round(value)) : ''
  const shown = focused ? raw : raw ? nf.format(Number(raw)) : ''
  return (
    <input
      type="text" inputMode="numeric" autoComplete="off" aria-label={label}
      value={shown}
      placeholder={placeholder !== undefined ? nf.format(Math.round(placeholder)) : undefined}
      onFocus={(e) => { setFocused(true); setTimeout(() => e.target.select(), 0) }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
        if (digits === '') onChange(allowEmpty ? '' : 0)
        else onChange(Number(digits))
      }}
    />
  )
}

// Prosent. Lagres som brøk (0,04 = 4 %), vises som prosent. Komma og punktum aksepteres.
export function PctInput({ value, onChange, placeholder, allowEmpty = false, label }) {
  const [text, setText] = useState(null)
  const fmt = (v) => String(Math.round(v * 100 * 1000) / 1000).replace('.', ',')
  const shown = text !== null ? text : isNum(value) ? fmt(value) : ''
  return (
    <span className="unit-wrap">
      <input
        type="text" inputMode="decimal" autoComplete="off" aria-label={label}
        value={shown}
        placeholder={placeholder !== undefined ? fmt(placeholder) : undefined}
        onFocus={(e) => { setText(isNum(value) ? fmt(value) : ''); setTimeout(() => e.target.select(), 0) }}
        onBlur={() => setText(null)}
        onChange={(e) => {
          const t = e.target.value
          if (/[^0-9.,\s]/.test(t)) return
          setText(t)
          const clean = t.replace(/\s/g, '').replace(',', '.')
          if (clean === '') { if (allowEmpty) onChange(''); return }
          const n = Number(clean)
          if (Number.isFinite(n)) onChange(n / 100)
        }}
      />
      <em>%</em>
    </span>
  )
}

export function DateInput({ value, onChange, min, max, label }) {
  return (
    <input
      type="date" value={value} min={min} max={max} aria-label={label}
      onChange={(e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onChange(e.target.value) }}
    />
  )
}
