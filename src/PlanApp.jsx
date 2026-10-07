import { useEffect, useMemo, useRef, useState } from 'react'
import { runPlan, yearInputs, dayToDate, FIRST_YEAR, YEARS } from './planEngine.js'
import { clampField, clampMoney, loadStore, saveStore, clearAll, encodeStore, decodeStore, freshState, freshStore, copyScenarioData, MAX_NAME } from './planState.js'
import { Field, MoneyInput, PctInput, DateInput, kr, krShort, pct } from './inputs.jsx'
import IncomeChart from './IncomeChart.jsx'
import { ScenarioBar, ChosenBanner } from './ScenarioBar.jsx'
import ComparePanel from './ComparePanel.jsx'

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']
const fmtDay = (n) => dayToDate(n).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

export default function PlanApp() {
  // Tre uavhengige scenarioer. Alle redigeringer under gjelder det aktive scenarioet.
  const [store, setStore] = useState(loadStore)
  useEffect(() => saveStore(store), [store])
  // Åpnes siden fra en overføringslenke (#d=...), tilbys import av scenarioene.
  const hashDone = useRef(false)
  useEffect(() => {
    if (hashDone.current) return
    hashDone.current = true
    const h = window.location.hash
    if (!h.startsWith('#d=')) return
    const imported = decodeStore(h)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    if (!imported) { window.alert('Lenken er ufullstendig eller ødelagt, så ingenting ble hentet inn.'); return }
    if (window.confirm('Erstatte alle scenarioene på denne enheten med de fra lenken?')) setStore(imported)
  }, [])
  const [transfer, setTransfer] = useState({ code: '', paste: '', msg: '' })
  const makeCode = () => setTransfer((t) => ({ ...t, code: encodeStore(store), msg: '' }))
  const linkOf = (code) => window.location.origin + window.location.pathname + '#d=' + code
  const copyText = async (text, okMsg) => {
    try { await navigator.clipboard.writeText(text); setTransfer((t) => ({ ...t, msg: okMsg })) }
    catch { setTransfer((t) => ({ ...t, msg: 'Kunne ikke kopiere automatisk. Marker teksten og kopier selv.' })) }
  }
  const importCode = () => {
    const imported = decodeStore(transfer.paste)
    if (!imported) { setTransfer((t) => ({ ...t, msg: 'Fant ingen gyldig kode eller lenke i teksten.' })); return }
    if (window.confirm('Erstatte alle tre scenarioene på denne enheten med de du har limt inn?')) {
      setStore(imported)
      setTransfer({ code: '', paste: '', msg: 'Scenarioene er hentet inn.' })
    }
  }
  // Hvert scenario beregnes for seg. Resultatet gjenbrukes så lenge scenarioets data er uendret.
  const cache = useRef(new WeakMap())
  const planOf = (data) => {
    let p = cache.current.get(data)
    if (!p) { p = runPlan(data); cache.current.set(data, p) }
    return p
  }
  const plans = store.scenarios.map((sc) => planOf(sc.data))
  const activeIdx = Math.max(0, store.scenarios.findIndex((sc) => sc.id === store.active))
  const activeSc = store.scenarios[activeIdx]
  const g = activeSc.data
  const plan = plans[activeIdx]
  const yi = useMemo(() => yearInputs(g), [g])
  const { years, summary: S } = plan
  const steadyYears = years.filter((r) => r.year >= S.steadyFrom)
  const avgWithdrawalPerMonth = steadyYears.reduce((a, r) => a + r.withdrawals, 0) / Math.max(1, steadyYears.length) / 12
  const setG = (fn) => setStore((st) => ({ ...st, scenarios: st.scenarios.map((sc) => (sc.id === st.active ? { ...sc, data: fn(sc.data) } : sc)) }))
  const selectScenario = (id) => setStore((st) => ({ ...st, active: id }))
  const renameScenario = (id, name) => setStore((st) => ({ ...st, scenarios: st.scenarios.map((sc) => (sc.id === id ? { ...sc, name: name.slice(0, MAX_NAME) } : sc)) }))
  const chooseScenario = (id) => setStore((st) => ({ ...st, chosen: id }))
  const copyInto = (srcId) => {
    const src = store.scenarios.find((sc) => sc.id === srcId)
    if (src && window.confirm(`Overskrive alle verdier i «${activeSc.name}» med verdiene fra «${src.name}»?`)) {
      setG(() => copyScenarioData(src.data))
    }
  }

  const put = (k) => (v) => { if (typeof v === 'number' && !Number.isFinite(v)) return; setG((x) => ({ ...x, [k]: typeof v === 'number' ? clampField(k, v) : v })) }
  const toggle = (k) => () => setG((x) => ({ ...x, [k]: !x[k] }))
  const setYr = (year, field, v) => setG((x) => {
    const yr = { ...x.yr }
    const o = { ...(yr[year] || {}) }
    if (v === '' || v === undefined || !Number.isFinite(v)) delete o[field]
    else o[field] = field === 'rate' ? clampField('rate', v) : clampMoney(v)
    if (Object.keys(o).length) yr[year] = o
    else delete yr[year]
    return { ...x, yr }
  })
  const setPayout = (id, f, v) => setG((x) => ({ ...x, payouts: x.payouts.map((p) => (p.id === id ? { ...p, [f]: f === 'amount' ? clampMoney(v) : v } : p)) }))
  const addPayout = () => setG((x) => x.payouts.length >= 30 ? x : ({ ...x, payouts: [...x.payouts, { id: Math.max(0, ...x.payouts.map((p) => p.id)) + 1, label: 'Ny utbetaling', date: '2027-12-01', amount: 0 }] }))
  const delPayout = (id) => setG((x) => ({ ...x, payouts: x.payouts.filter((p) => p.id !== id) }))
  const resetActive = () => {
    if (window.confirm(`Nullstille «${activeSc.name}» til standardverdier? De to andre scenarioene berøres ikke.`)) setG(() => freshState())
  }
  const resetAll = () => {
    if (window.confirm('Slette alle tre scenarioene og alt som er lagret på denne enheten, og starte på nytt?')) {
      clearAll()
      setStore(freshStore())
    }
  }

  const steadyYear = years.find((y) => y.year >= S.steadyFrom) || years[years.length - 1]
  const yieldAfterTax = steadyYear.open > 0 ? steadyYear.netReturn / steadyYear.open : 0
  const taxOnCapital = S.totalInterestTax + S.totalWealthTax + S.totalGainTax

  // Rader i resultattabellen. hide = skjul raden hvis alle år er 0.
  const sections = [
    { title: 'Kapital', rows: [
      { l: 'Saldo 1. januar', f: (y) => y.open },
      { l: 'Salgsoppgjør inn på konto', f: (y) => y.settlementIn, hide: true },
      { l: 'Utbetalinger (samboer m.m.)', f: (y) => -y.payouts, hide: true },
      { l: 'Kjøp av ny bolig inkl. avgift og omkostninger', f: (y) => -y.homeOut, hide: true },
      { l: 'Renteinntekt (brutto)', f: (y) => y.interest },
      { l: 'Skatt på renter', f: (y) => -y.interestTax },
      { l: 'Formuesskatt', f: (y) => -y.wealthTax },
      { l: 'Skatt på salgsgevinst', f: (y) => -y.gainTax, hide: true },
      { l: 'Netto avkastning (renter − skatt − formuesskatt)', f: (y) => y.netReturn, strong: true },
      { l: 'Uttak fra kapital til livsopphold', f: (y) => -y.withdrawals },
      { l: 'Restskatt fra året før (inkl. rentetillegg)', f: (y) => -y.restPaid, hide: true },
      { l: 'Saldo 31. desember', f: (y) => y.close, strong: true },
      { l: 'Formuesgrunnlag 31.12 (etter fradrag av gjeld)', f: (y) => y.wealthNet },
    ] },
    { title: 'Pensjon', rows: [
      { l: 'Folketrygd per måned', f: (y) => y.folkMonthly },
      { l: 'Tjenestepensjon per måned', f: (y) => y.tjenesteMonthly },
      { l: 'Pensjon brutto per år (tjenestepensjon fra startdato)', f: (y) => y.pension },
      { l: 'Skatt på pensjon (trekkes)', f: (y) => -y.trekkPensjon },
      { l: 'Pensjon etter skatt per år', f: (y) => y.pensionNet, strong: true },
      { l: 'Herav pensjonistfradrag i skatten', f: (y) => y.pensionCredit },
    ] },
    { title: 'Til disposisjon', rows: [
      { l: 'Disponibelt per måned (pensjon + uttak)', f: (y) => y.disposablePerMonth, strong: true },
      { l: 'Det samme i 2027-kroner', f: (y) => y.disposablePerMonthReal, strong: true },
    ] },
  ]

  // Kontantstrøm: uttakene slås sammen til én linje per år, så listen blir lesbar.
  const cashRows = useMemo(() => {
    const out = [], agg = {}
    for (const e of plan.events) {
      if (e.kind === 'uttak') {
        const a = agg[e.year] || (agg[e.year] = { sum: 0, day: e.day, balance: e.balance, n: 0 })
        a.sum += e.amount; a.day = e.day; a.balance = e.balance; a.n += 1
      } else out.push(e)
    }
    Object.entries(agg).forEach(([y, a]) => out.push({ day: a.day, year: +y, prio: 3, kind: 'uttak', label: `Uttak til livsopphold (${a.n} utbetalinger)`, amount: a.sum, balance: a.balance }))
    return out.sort((a, b) => a.day - b.day || a.prio - b.prio)
  }, [plan.events])

  const pctField = (key, label, hint) => (
    <Field label={label} hint={hint}><PctInput label={label} value={g[key]} onChange={put(key)} /></Field>
  )
  const moneyField = (key, label, hint) => (
    <Field label={label} hint={hint}><MoneyInput label={label} value={g[key]} onChange={put(key)} /></Field>
  )
  const monthSelect = (key, label) => (
    <Field label={label}>
      <select value={g[key]} onChange={(e) => put(key)(Number(e.target.value))}>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
    </Field>
  )

  return (
    <div className="wrap">
      <h1>Eiendomsalg · tiårsplan {FIRST_YEAR}–{FIRST_YEAR + YEARS - 1}</h1>
      <p className="lede">
        Salget gjøres opp i 2027. Modellen følger kapitalen dag for dag: utbetalinger, boligkjøp, renter, skatt og formuesskatt,
        og viser hva du har til disposisjon hvert år sammen med pensjonen. Alle tall er anslag med dagens skatteregler, og du kan endre alt under.
        Du kan ha tre alternative scenarioer og velge ett som ditt valg.
      </p>

      <ChosenBanner store={store} plans={plans} onSelect={selectScenario} />
      <ScenarioBar store={store} plans={plans} onSelect={selectScenario} onRename={renameScenario} onChoose={chooseScenario} onCopy={copyInto} />

      {/* key = scenario-id: feltene bygges på nytt når du bytter scenario, så ingen halvferdig redigering følger med */}
      <div key={activeSc.id}>

      {plan.warnings.length > 0 && (
        <div className="panel warn" role="alert">
          <h2>Sjekk dette</h2>
          {plan.warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      )}

      <div className="panel">
        <h2>Hovedresultat · {activeSc.name}</h2>
        <div className="hero-grid multi">
          <div className="hero">
            <span>Netto avkastning per måned</span>
            <strong>{krShort(S.avgNetReturnPerMonth)}</strong>
            <small>snitt {S.steadyFrom}–{FIRST_YEAR + YEARS - 1}, etter skatt og formuesskatt · {pct(yieldAfterTax)} av kapitalen per år</small>
          </div>
          <div className="hero">
            <span>Disponibelt per måned</span>
            <strong>{krShort(S.avgDisposablePerMonth)}</strong>
            <small>pensjon etter skatt + avkastning · {krShort(S.avgDisposablePerMonthReal)} kr i 2027-kroner</small>
          </div>
          <div className="hero">
            <span>Kapital 31.12.{FIRST_YEAR + YEARS - 1}</span>
            <strong>{krShort(S.closingAfterTax)}</strong>
            <small>{krShort(S.closingReal)} kr i 2027-kroner{S.outstandingTax > 1 ? ` · etter ${krShort(S.outstandingTax)} kr restskatt som forfaller året etter` : ''}</small>
          </div>
          <div className="hero">
            <span>Skatt på kapital, {YEARS} år</span>
            <strong>{krShort(taxOnCapital)}</strong>
            <small>herav formuesskatt {krShort(S.totalWealthTax)} kr og skatt på renter {krShort(S.totalInterestTax)} kr</small>
          </div>
        </div>
        <p className="field-hint">
          Netto kapital på konto etter salg og innfridd gjeld: <b>{kr(S.initial)}</b>.
          Ny bolig koster totalt <b>{kr(S.home.total)}</b>{S.home.docFee > 0 ? ` (inkl. dokumentavgift ${kr(S.home.docFee)})` : ''}.
          Snittene gjelder fra {S.steadyFrom}, første hele år etter siste utbetaling og boligkjøp.
          {S.targetEnabled ? ` Sparemål: ${kr(S.target)} i ${FIRST_YEAR + YEARS - 1}, som gir ${kr(S.extraPerMonth)} per måned i ekstra forbruk.` : ''}
        </p>
      </div>

      <ComparePanel store={store} plans={plans} />

      <div className="panel">
        <h2>Disponibel inntekt per måned · {activeSc.name}</h2>
        <IncomeChart years={years} />
      </div>

      <div className="panel">
        <h2>År for år · {activeSc.name}</h2>
        <div className="plan-scroll">
          <table className="plan-table">
            <thead>
              <tr><th></th>{years.map((y) => <th key={y.year}>{y.year}</th>)}</tr>
            </thead>
            <tbody>
              <tr className="sub"><td>Rente / avkastning</td>{years.map((y) => <td key={y.year}>{pct(y.rate)}</td>)}</tr>
              {sections.map((s) => (
                [<tr className="sect" key={s.title}><td colSpan={years.length + 1}>{s.title}</td></tr>,
                  ...s.rows.filter((r) => !r.hide || years.some((y) => Math.abs(r.f(y)) > 0.5)).map((r) => (
                    <tr key={r.l} className={r.strong ? 'strong' : ''}>
                      <td>{r.l}</td>{years.map((y) => <td key={y.year}>{krShort(r.f(y))}</td>)}
                    </tr>
                  ))]
              ))}
            </tbody>
          </table>
        </div>
        <p className="field-hint">
          Alle beløp i kroner. 2027 inkluderer lønn (hvis du har lagt inn arbeidsmåneder). Skatt på pensjon trekkes fra pensjonen og belaster ikke kapitalen.
          Skatt på renter, salgsgevinst og formue betales fra kapitalen.
        </p>
        <details className="tax-detail">
          <summary>Vis alle hendelser på kontoen (dato for dato)</summary>
          <div className="plan-scroll tall">
            <table className="plan-table events">
              <thead><tr><th>Dato</th><th>Hendelse</th><th>Beløp</th><th>Saldo etter</th></tr></thead>
              <tbody>
                {cashRows.map((e, i) => (
                  <tr key={i}><td>{fmtDay(e.day)}</td><td>{e.label}</td><td>{krShort(e.amount)}</td><td>{krShort(e.balance)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="panel">
        <h2>Salget og inntekter i 2027</h2>
        <div className="grid">
          <Field label="Salgstidspunkt" hint="Må ligge i 2027"><DateInput label="Salgstidspunkt" value={g.sale} min="2027-01-01" max="2027-12-31" onChange={put('sale')} /></Field>
          {moneyField('buffer', 'Dager fra salg til pengene er på konto')}
          {moneyField('total', 'Salgssum')}
          {moneyField('debt', 'Gjeld som innfris ved salg')}
          {moneyField('saleCost', 'Salgsomkostninger')}
          {moneyField('land', 'Skattepliktig tomteandel')}
          {moneyField('landCost', 'Tomtekostpris')}
          {moneyField('landImprovements', 'Påkostninger tomt')}
          {moneyField('purchaseTotal', 'Opprinnelig kjøpesum (solgt eiendom)', 'Brukes bare til gevinst på solgt bolig')}
          {moneyField('acquisitionCosts', 'Kjøpskostnader (solgt eiendom)')}
          {moneyField('propertyImprovements', 'Påkostninger (solgt bolig)')}
          {moneyField('salary', 'Lønn per måned i 2027')}
          <Field label="Antall arbeidsmåneder i 2027">
            <select value={g.salaryMonths} onChange={(e) => put('salaryMonths')(Number(e.target.value))}>
              {Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>{i} {i === 1 ? 'måned' : 'måneder'}</option>)}
            </select>
          </Field>
          {moneyField('rent', 'Leie per måned i 2027')}
          {moneyField('otherAssets', 'Andre eiendeler (formue)')}
          {moneyField('otherDebt', 'Annen gjeld (formue)')}
        </div>
        <div className="checks">
          <label><input type="checkbox" checked={g.residenceGainTaxFree} onChange={toggle('residenceGainTaxFree')} /> Gevinst på solgt bolig er skattefri (eier- og brukstidsreglene)</label>
          <label><input type="checkbox" checked={g.landTaxable} onChange={toggle('landTaxable')} /> Tomteandelen over naturlig arrondert tomt er skattepliktig</label>
          <label><input type="checkbox" checked={g.rentTaxable} onChange={toggle('rentTaxable')} /> Leieinntekten er skattepliktig</label>
          <label><input type="checkbox" checked={g.jointTaxation} onChange={toggle('jointTaxation')} /> Gift/registrert partner/meldepliktig samboer – skattlegges samlet</label>
        </div>
      </div>

      <div className="panel">
        <h2>Utbetalinger fra kapitalen</h2>
        <p className="field-hint">Beløp som skal ut av kontoen på en bestemt dato, for eksempel oppgjør til samboer eller innfrielse av lån. Pengene tjener renter helt frem til datoen.</p>
        <div className="payouts">
          {g.payouts.map((p) => (
            <div className="payout-row" key={p.id}>
              <Field label="Beskrivelse"><input type="text" value={p.label} maxLength={60} onChange={(e) => setPayout(p.id, 'label', e.target.value)} /></Field>
              <Field label="Dato"><DateInput label="Dato" value={p.date} min="2027-01-01" max="2036-12-31" onChange={(v) => setPayout(p.id, 'date', v)} /></Field>
              <Field label="Beløp"><MoneyInput label="Beløp" value={p.amount} onChange={(v) => setPayout(p.id, 'amount', v)} /></Field>
              <button type="button" className="ghost" onClick={() => delPayout(p.id)} aria-label={`Fjern ${p.label}`}>Fjern</button>
            </div>
          ))}
        </div>
        <button type="button" className="add" onClick={addPayout}>+ Legg til utbetaling</button>
      </div>

      <div className="panel">
        <h2>Ny bolig</h2>
        <div className="grid">
          {moneyField('homePrice', 'Kjøpesum ny bolig', 'Sett 0 hvis du ikke kjøper')}
          <Field label="Kjøpsdato"><DateInput label="Kjøpsdato" value={g.homeDate} min="2027-01-01" max="2036-12-31" onChange={put('homeDate')} /></Field>
          {pctField('homeDocFeeRate', 'Dokumentavgift', 'Gjelder brukt selveierbolig. Nyoppført: slå av under.')}
          {moneyField('homeCosts', 'Andre omkostninger ved kjøpet', 'Tinglysing, takst, megler m.m.')}
          {moneyField('homeImprovements', 'Oppussing og innredning', 'Betales på kjøpsdato')}
        </div>
        <div className="checks">
          <label><input type="checkbox" checked={g.homeDocFee} onChange={toggle('homeDocFee')} /> Beregn dokumentavgift (ikke for nyoppført bolig)</label>
        </div>
      </div>

      <div className="panel">
        <h2>Sparemål og forbruk</h2>
        <div className="checks">
          <label><input type="checkbox" checked={!!g.targetEnabled} onChange={toggle('targetEnabled')} /> Jeg vil bruke av kapitalen, og la en bestemt sum stå igjen i {FIRST_YEAR + YEARS - 1}</label>
        </div>
        {g.targetEnabled && (
          <>
            <div className="grid">
              {moneyField('targetClosing', `Kapital som skal stå igjen 31.12.${FIRST_YEAR + YEARS - 1} (etter skatt)`, 'Appen regner ut hvor mye du kan bruke resten av tiden')}
            </div>
            <div className="hero-grid multi">
              <div className="hero">
                <span>Ekstra forbruk per måned</span>
                <strong>{krShort(S.extraPerMonth)}</strong>
                <small>{krShort(S.extraPerMonth * 12)} kr per år, i tillegg til avkastningen · fra {S.steadyFrom}</small>
              </div>
              <div className="hero">
                <span>Totalt uttak per måned</span>
                <strong>{krShort(avgWithdrawalPerMonth)}</strong>
                <small>avkastning etter skatt + ekstra forbruk (snitt {S.steadyFrom}–{FIRST_YEAR + YEARS - 1})</small>
              </div>
              <div className="hero">
                <span>Disponibelt per måned</span>
                <strong>{krShort(S.avgDisposablePerMonth)}</strong>
                <small>pensjon etter skatt + uttak</small>
              </div>
            </div>
          </>
        )}
        <p className="field-hint">
          Ekstra forbruk tas fra og med {S.steadyFrom}, første hele år etter siste utbetaling og boligkjøp, og gjelder alle år du ikke har overstyrt uttaket i tabellen under.
          Tallet regnes ut slik at kapitalen etter skatt blir lik målet. Uten sparemål lar appen kapitalen stå urørt og du bruker bare avkastningen.
        </p>
      </div>

      <div className="panel">
        <h2>Pensjon, avkastning og inflasjon</h2>
        <div className="grid">
          {moneyField('folkMonthly', 'Folketrygd per måned (brutto, 2027)')}
          {moneyField('tjenesteMonthly', 'Tjenestepensjon per måned (brutto)')}
          <Field label="Tjenestepensjon starter" hint="Utbetales forholdsmessig første år"><DateInput label="Tjenestepensjon starter" value={g.tjenesteStart} min="2027-01-01" max="2036-12-31" onChange={put('tjenesteStart')} /></Field>
          {pctField('pensionGrowth', 'Årlig økning i pensjon', 'Antakelse. Overstyr per år i tabellen under.')}
          {pctField('rate', 'Rente / avkastning på kapitalen', 'Gjelder alle år, med mindre du overstyrer')}
          {pctField('inflation', 'Inflasjon', 'Brukes bare til tall i 2027-kroner')}
        </div>
        <div className="checks">
          <label><input type="checkbox" checked={g.tjenesteCredit} onChange={toggle('tjenesteCredit')} /> Tjenestepensjonen gir også rett til pensjonistfradrag (vanligvis bare folketrygd)</label>
        </div>

        <h3 className="sub-h">Overstyr per år</h3>
        <p className="field-hint">
          Tomme felt bruker verdien fra året før (rente) eller årlig økning (pensjon). Skriv inn en verdi for å endre fra og med det året.
          Uttak: tomt = hele netto avkastning tas ut, så kapitalen står uendret. Fyll inn et beløp for å velge selv (kroner per år).
        </p>
        <div className="plan-scroll">
          <table className="plan-table inputs">
            <thead><tr><th></th>{years.map((y) => <th key={y.year}>{y.year}</th>)}</tr></thead>
            <tbody>
              <tr>
                <td>Rente / avkastning (%)</td>
                {yi.map((y) => <td key={y.year}><PctInput label={`Rente ${y.year}`} allowEmpty value={g.yr[y.year]?.rate} placeholder={y.defaults.rate} onChange={(v) => setYr(y.year, 'rate', v)} /></td>)}
              </tr>
              <tr>
                <td>Folketrygd per måned</td>
                {yi.map((y) => <td key={y.year}><MoneyInput label={`Folketrygd ${y.year}`} allowEmpty value={g.yr[y.year]?.folk} placeholder={y.defaults.folk} onChange={(v) => setYr(y.year, 'folk', v)} /></td>)}
              </tr>
              <tr>
                <td>Tjenestepensjon per måned</td>
                {yi.map((y) => <td key={y.year}><MoneyInput label={`Tjenestepensjon ${y.year}`} allowEmpty value={g.yr[y.year]?.tjeneste} placeholder={y.defaults.tjeneste} onChange={(v) => setYr(y.year, 'tjeneste', v)} /></td>)}
              </tr>
              <tr>
                <td>Uttak fra kapital per år</td>
                {yi.map((y) => <td key={y.year}><MoneyInput label={`Uttak ${y.year}`} allowEmpty value={g.yr[y.year]?.withdrawal} onChange={(v) => setYr(y.year, 'withdrawal', v)} /></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Betaling av skatt</h2>
        <div className="grid">
          {pctField('advanceShare', 'Andel betalt som forskuddsskatt', '100 % = alt betales i inntektsåret')}
          {monthSelect('advanceMonth', 'Forskudd regnes betalt i')}
          {monthSelect('taxPaymentMonth', 'Restskatt betales i')}
          {pctField('taxAuthorityRate', 'Rentetillegg på restskatt', 'Sist kjente sats')}
        </div>
        <p className="field-hint">Du betaler forskuddsskatt selv via skatteetaten.no. Modellen legger hele forskuddet på én dato (15. i valgt måned) som en forenkling.</p>
      </div>

      <details className="panel">
        <summary>Avanserte forutsetninger: inntektsskatt</summary>
        <p className="field-hint">Satsene for 2027 og senere er ikke kjent. Modellen bruker sist kjente satser. Oppdater her når nye satser publiseres.</p>
        <div className="grid">
          {moneyField('personfradrag', 'Personfradrag')}
          {pctField('trygdeLonn', 'Trygdeavgift lønn')}
          {pctField('trygdePensjon', 'Trygdeavgift pensjon')}
          {pctField('mfLonnSats', 'Minstefradrag lønn, sats')}
          {moneyField('mfLonnTak', 'Minstefradrag lønn, tak')}
          {pctField('mfPensjonSats', 'Minstefradrag pensjon, sats')}
          {moneyField('mfPensjonTak', 'Minstefradrag pensjon, tak')}
          {pctField('fellesskattSats', 'Skatt på alminnelig inntekt')}
          {moneyField('pensionCreditMax', 'Pensjonistfradrag, maks')}
          {moneyField('pensionStep1', 'Pensjonistfradrag: avtrapping starter')}
          {moneyField('pensionStep2', 'Pensjonistfradrag: trinn 2 starter')}
          {pctField('pensionRate1', 'Avtrappingssats trinn 1')}
          {pctField('pensionRate2', 'Avtrappingssats trinn 2')}
        </div>
        <h3 className="sub-h">Trinnskatt</h3>
        <div className="grid">
          {[1, 2, 3, 4, 5].map((i) => [
            <div key={'f' + i}>{moneyField('trinn' + i + 'Fra', `Trinn ${i}: fra`)}</div>,
            <div key={'s' + i}>{pctField('trinn' + i + 'Sats', `Trinn ${i}: sats`)}</div>,
          ])}
        </div>
      </details>

      <details className="panel">
        <summary>Avanserte forutsetninger: formuesskatt</summary>
        <p className="field-hint">Bunnfradrag og trinnbredde gjelder enslig og dobles automatisk ved felles ligning. Bankinnskudd verdsettes til 100 %.</p>
        <div className="grid">
          {moneyField('formueBunnfradrag', 'Bunnfradrag (enslig)')}
          {moneyField('formueTrinn2Bredde', 'Bredde på trinn 1 (enslig)')}
          {pctField('formueSats1', 'Sats trinn 1')}
          {pctField('formueSats2', 'Sats trinn 2')}
          {moneyField('primaerboligTak', 'Primærbolig: verdsettelsestak')}
          {pctField('primaerboligSatsUnder', 'Primærbolig: andel av verdi under tak')}
          {pctField('primaerboligSatsOver', 'Primærbolig: andel av verdi over tak')}
        </div>
      </details>

      <div className="panel">
        <h2>Overfør til en annen enhet</h2>
        <p className="field-hint">
          Tallene lagres bare i nettleseren på denne enheten. For å få de samme tre scenarioene på iPhone eller Mac lager du en kode her,
          sender den til deg selv (Notater, melding eller e-post) og limer den inn på den andre enheten. Alternativt åpner du lenken der.
        </p>
        <div className="reset-row">
          <button type="button" className="primary" onClick={makeCode}>Lag overføringskode</button>
        </div>
        {transfer.code && (
          <>
            <textarea className="transfer-box" readOnly rows={4} value={linkOf(transfer.code)} onFocus={(e) => e.target.select()} aria-label="Overføringslenke" />
            <div className="reset-row">
              <button type="button" className="ghost" onClick={() => copyText(linkOf(transfer.code), 'Lenken er kopiert. Lim den inn i Notater eller en melding til deg selv.')}>Kopier lenke</button>
              <button type="button" className="ghost" onClick={() => copyText(transfer.code, 'Koden er kopiert.')}>Kopier bare koden</button>
            </div>
          </>
        )}
        <label className="field">
          <span className="field-label">Hent inn fra en annen enhet: lim inn kode eller lenke</span>
          <textarea className="transfer-box" rows={3} value={transfer.paste} onChange={(e) => setTransfer((t) => ({ ...t, paste: e.target.value, msg: '' }))} placeholder="EA1.…" />
        </label>
        <div className="reset-row">
          <button type="button" className="ghost" disabled={!transfer.paste.trim()} onClick={importCode}>Hent inn og erstatt alle scenarioer</button>
        </div>
        {transfer.msg && <p className="field-hint" role="status"><b>{transfer.msg}</b></p>}
      </div>

      <div className="footnote">
        <b>Forutsetninger og begrensninger.</b> Renter beregnes som enkel rente per dag på saldoen og krediteres 31.12. Pensjonen øker med valgt årlig prosent.
        Pensjonistfradraget beregnes bare av folketrygden, med mindre du krysser av for noe annet. Formuesskatt beregnes på saldo 31.12 pluss skattemessig verdi av ny bolig,
        og er forenklet: fond og aksjer er ikke modellert (de verdsettes og skattlegges annerledes enn innskudd). Rentetillegg beregnes slik forrige versjon gjorde.
        Skattereglene er forenklet og forutsetter dagens satser, så resultatet er et planleggingsanslag og ikke skatteberegning.
        Kontroller viktige beslutninger mot skatteetaten.no eller en rådgiver. Verdiene lagres bare i denne nettleseren på denne enheten, ikke på noen server. iPhone og Mac har hver sin lagring.
        <div className="reset-row">
          <button type="button" className="ghost" onClick={resetActive}>Nullstill {activeSc.name}</button>
          <button type="button" className="ghost" onClick={resetAll}>Slett alt lagret og start på nytt</button>
        </div>
      </div>
      </div>
    </div>
  )
}
