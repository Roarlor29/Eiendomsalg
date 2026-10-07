import { useState } from 'react'
import { krShort } from './inputs.jsx'

// Søylediagram: disponibel inntekt per måned, per år, delt i pensjon etter skatt og uttak fra kapital.
// Farger er fra den validerte standardpaletten (blå/oransje, godkjent for fargesvakhet).
const SERIES = [
  { key: 'pensionNetM', label: 'Pensjon etter skatt', color: '#2a78d6' },
  { key: 'withdrawalM', label: 'Uttak fra kapital (netto avkastning)', color: '#eb6834' },
]
const W = 720, H = 300, M = { t: 14, r: 12, b: 30, l: 62 }

function niceMax(v) {
  if (v <= 0) return 10000
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

// Avrundet topp (4 px) på øverste segment, helt bunn på alle.
function barPath(x, y, w, h, roundTop) {
  const r = roundTop ? Math.min(4, w / 2, h) : 0
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
}

export default function IncomeChart({ years }) {
  const [active, setActive] = useState(null)
  const data = years.map((y) => ({
    year: y.year,
    pensionNetM: Math.max(0, y.pensionNet / 12),
    withdrawalM: Math.max(0, y.withdrawals / 12),
  }))
  const maxV = niceMax(Math.max(...data.map((d) => d.pensionNetM + d.withdrawalM)))
  const iw = W - M.l - M.r, ih = H - M.t - M.b
  const slot = iw / data.length, bw = Math.min(46, slot * 0.62)
  const y = (v) => M.t + ih - (v / maxV) * ih
  const ticks = [0, 1, 2, 3, 4].map((i) => (maxV / 4) * i)
  const a = active !== null ? data[active] : null

  return (
    <div className="chart-wrap">
      <div className="chart-legend" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
      <div className="chart-box" onPointerLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Disponibel inntekt per måned etter skatt, per år. Tallene står i tabellen under.">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#dfe6e2" strokeWidth="1" />
              <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#65716b">{krShort(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = M.l + slot * i + slot / 2
            const x = cx - bw / 2
            const hP = (d.pensionNetM / maxV) * ih
            const hW = (d.withdrawalM / maxV) * ih
            const gap = hP > 0 && hW > 0 ? 2 : 0 // 2 px mellomrom mellom segmentene
            return (
              <g key={d.year} onPointerEnter={() => setActive(i)} onClick={() => setActive(active === i ? null : i)} style={{ cursor: 'pointer' }}>
                <rect x={M.l + slot * i} y={M.t} width={slot} height={ih} fill="transparent" />
                {hP > 0 && <path d={barPath(x, y(d.pensionNetM), bw, hP, hW <= 0)} fill={SERIES[0].color} />}
                {hW > 0 && <path d={barPath(x, y(d.pensionNetM + d.withdrawalM), bw, Math.max(0, hW - gap), true)} fill={SERIES[1].color} />}
                <text x={cx} y={H - 10} textAnchor="middle" fontSize="12" fill={active === i ? '#17201c' : '#65716b'} fontWeight={active === i ? 700 : 400}>{d.year}</text>
              </g>
            )
          })}
        </svg>
        {a && (
          <div className="chart-tip" style={{ left: `${((M.l + slot * active + slot / 2) / W) * 100}%` }}>
            <b>{a.year}</b>
            <span><i style={{ background: SERIES[0].color }} />Pensjon etter skatt: {krShort(a.pensionNetM)} kr/mnd</span>
            <span><i style={{ background: SERIES[1].color }} />Uttak fra kapital: {krShort(a.withdrawalM)} kr/mnd</span>
            <span className="tip-total">Sum: {krShort(a.pensionNetM + a.withdrawalM)} kr/mnd</span>
          </div>
        )}
      </div>
      <p className="chart-note">Kroner per måned, nominelt (ikke justert for prisvekst). Trykk eller hold over en søyle for tall.</p>
    </div>
  )
}
