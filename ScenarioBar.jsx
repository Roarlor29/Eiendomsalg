import { krShort } from './inputs.jsx'
import { MAX_NAME } from './planState.js'

// Banner øverst for scenarioet brukeren har valgt som sitt, og fanene for å bytte scenario.
export function ChosenBanner({ store, plans, onSelect }) {
  const idx = store.scenarios.findIndex((s) => s.id === store.chosen)
  if (idx < 0) return null
  const sc = store.scenarios[idx]
  const S = plans[idx].summary
  const here = store.active === sc.id
  return (
    <div className="chosen-banner" role="region" aria-label="Mitt valg">
      <div className="chosen-head">
        <span className="star" aria-hidden="true">★</span>
        <div>
          <span className="chosen-label">Mitt valg</span>
          <b>{sc.name}</b>
        </div>
        {!here && <button type="button" className="ghost small" onClick={() => onSelect(sc.id)}>Vis</button>}
      </div>
      <div className="chosen-nums">
        <span><em>Disponibelt per måned</em><b>{krShort(S.avgDisposablePerMonth)} kr</b></span>
        <span><em>Netto avkastning per måned</em><b>{krShort(S.avgNetReturnPerMonth)} kr</b></span>
        <span><em>Kapital 31.12.2036</em><b>{krShort(S.closingAfterTax)} kr</b></span>
      </div>
    </div>
  )
}

export function ScenarioBar({ store, plans, onSelect, onRename, onChoose, onCopy }) {
  const active = store.scenarios.find((s) => s.id === store.active)
  const isChosen = store.chosen === active.id
  const others = store.scenarios.filter((s) => s.id !== active.id)
  return (
    <div className="panel scenario-bar">
      <div className="scn-tabs" role="tablist" aria-label="Scenarioer">
        {store.scenarios.map((s, i) => {
          const S = plans[i].summary
          const on = s.id === store.active
          return (
            <button
              key={s.id} type="button" role="tab" aria-selected={on}
              className={'scn-tab' + (on ? ' on' : '')} onClick={() => onSelect(s.id)}
            >
              <span className="scn-name">
                {store.chosen === s.id && <span className="star" aria-label="Mitt valg">★ </span>}
                {s.name}
                {plans[i].warnings.length > 0 && <span className="scn-warn" title="Har advarsler" aria-label="Har advarsler"> ⚠</span>}
              </span>
              <span className="scn-metric">{krShort(S.avgDisposablePerMonth)} kr/mnd</span>
            </button>
          )
        })}
      </div>
      <div className="scn-controls">
        <label className="field scn-rename">
          <span className="field-label">Navn på scenarioet</span>
          <input type="text" maxLength={MAX_NAME} value={active.name} onChange={(e) => onRename(active.id, e.target.value)} />
        </label>
        <div className="scn-actions">
          {isChosen
            ? <button type="button" className="ghost" onClick={() => onChoose(null)}>★ Mitt valg · fjern valget</button>
            : <button type="button" className="primary" onClick={() => onChoose(active.id)}>Velg dette som mitt valg</button>}
          <label className="field scn-copy">
            <span className="field-label">Kopier alle verdier hit fra</span>
            <select value="" onChange={(e) => { if (e.target.value) onCopy(Number(e.target.value)); e.target.value = '' }}>
              <option value="">Velg scenario …</option>
              {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
      </div>
      <p className="field-hint">
        Hvert scenario har sine egne tall og beregnes helt for seg. Endringer du gjør under gjelder bare <b>{active.name}</b>.
      </p>
    </div>
  )
}
