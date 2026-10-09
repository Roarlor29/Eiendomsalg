import { tax2027, wealthTax2027, primaryResidenceTaxValue } from './engineV2.js'
import { runPlan } from './planEngine.js'
import { DEFAULTS, clampField, freshStore, sanitizeStore, encodeStore, decodeStore } from './planState.js'

// Ingen testrammeverk her (bevisst: appen skal fortsatt bygges med det enkle Vite-oppsettet).
// Dette er enkle kontroller av skatte-, formuesskatt- og planlogikken som kjøres i nettleserkonsollen
// ved hver innlasting, slik at en fremtidig endring ikke utilsiktet endrer resultatet uten at noen merker det.
const clone = (o) => JSON.parse(JSON.stringify(o))

function plan(patch) {
  return runPlan({ ...clone(DEFAULTS), ...patch })
}

// Kontoidentitet: åpningssaldo + alle hendelser = sluttsaldo, hvert år.
function identityError(r) {
  return Math.max(...r.years.map((y) => {
    const sum = r.events.filter((e) => e.year === y.year).reduce((a, e) => a + e.amount, 0)
    return Math.abs(y.open + sum - y.close)
  }))
}

export function runSelfChecks() {
  const defaults = plan({})
  const cases = [
    { name: 'tax2027: ingen inntekt gir 0 i skatt', run: () => tax2027({}).total, expect: 0 },
    { name: 'tax2027: kjent lønn gir positiv skatt', run: () => tax2027({ salary: 900000 }).total > 0, expect: true },
    { name: 'wealthTax2027: under bunnfradrag gir 0', run: () => wealthTax2027(1000000, false), expect: 0 },
    { name: 'wealthTax2027: kjent nettoformue (enslig)', run: () => Math.round(wealthTax2027(5000000, false)), expect: Math.round((5000000 - 1900000) * 0.01) },
    { name: 'primaryResidenceTaxValue: under tak', run: () => primaryResidenceTaxValue(5000000), expect: 5000000 * 0.25 },
    { name: 'clampField: negativt beløp klippes til 0', run: () => clampField('total', -5), expect: 0 },
    { name: 'clampField: sats over 200 % klippes', run: () => clampField('rate', 5), expect: 2 },
    {
      name: 'plan: standardverdier gir 17,5 mill netto på konto',
      run: () => Math.round(defaults.summary.initial), expect: 17500000,
    },
    { name: 'plan: kontoidentitet stemmer alle år (standard)', run: () => identityError(defaults) < 0.01, expect: true },
    {
      name: 'plan: ingen NaN i resultatene',
      run: () => defaults.years.every((y) => Object.values(y).every((v) => typeof v !== 'number' || Number.isFinite(v))),
      expect: true,
    },
    {
      name: 'plan: rente for ett år er lik saldo × sats × dager/365',
      run: () => {
        const r = plan({ total: 1000000, debt: 0, payouts: [], homePrice: 0, advanceShare: 0, yr: { 2027: { withdrawal: 0 } } })
        return Math.round(r.years[0].interest)
      },
      expect: Math.round(1000000 * 0.04 * ((Date.UTC(2028, 0, 1) - Date.UTC(2027, 0, 29)) / 86400000) / 365),
    },
    {
      name: 'plan: utbetaling reduserer saldoen med nøyaktig beløpet',
      run: () => {
        // Uten rente, uttak og forskuddsskatt i 2027 er forskjellen i sluttsaldo lik utbetalingen
        const z = (g) => runPlan({ ...clone(DEFAULTS), rate: 0, advanceShare: 0, yr: { 2027: { withdrawal: 0 } }, ...g })
        return Math.round(z({ payouts: [] }).years[0].close - z({}).years[0].close)
      },
      expect: 5000000,
    },
    {
      name: 'scenarioer: tre uavhengige scenarioer med egne data',
      run: () => {
        const st = freshStore()
        return st.scenarios.length === 3 && st.scenarios[0].data !== st.scenarios[1].data && st.scenarios[0].data.payouts !== st.scenarios[2].data.payouts
      },
      expect: true,
    },
    {
      name: 'scenarioer: endring i B påvirker ikke beregningen av A',
      run: () => {
        const st = freshStore()
        const before = runPlan(st.scenarios[0].data).summary.closing
        st.scenarios[1].data.payouts[0].amount = 1000000
        st.scenarios[1].data.rate = 0.01
        return Math.abs(runPlan(st.scenarios[0].data).summary.closing - before) < 0.001 && Math.abs(runPlan(st.scenarios[1].data).summary.closing - before) > 1
      },
      expect: true,
    },
    {
      name: 'scenarioer: ugyldig valgt scenario og lange navn ryddes bort',
      run: () => {
        const st = sanitizeStore({ scenarios: [{ id: 1, name: 'x'.repeat(90), data: {} }], chosen: 7, active: 9 })
        return st.chosen === null && st.active === 1 && st.scenarios.length === 3 && st.scenarios[0].name.length === 30
      },
      expect: true,
    },
    {
      name: 'scenarioer: valgt scenario åpnes først',
      run: () => sanitizeStore({ scenarios: [], chosen: 3, active: 1 }).active,
      expect: 3,
    },
    {
      name: 'plan: salgsgevinst på tomt gir 22 % skatt (1,5 mill gevinst)',
      run: () => Math.round(plan({ land: 3500000, landCost: 2000000 }).years[0].gainTax), expect: 330000,
    },
    {
      name: 'overføringskode: kode → tilbake gir samme scenarioer',
      run: () => {
        const st = freshStore()
        st.scenarios[1].data.rate = 0.031
        st.scenarios[1].name = 'Æ Ø Å'
        st.chosen = 2
        const back = decodeStore('https://x.no/Eiendomsalg/#d=' + encodeStore(st))
        return !!back && back.scenarios[1].data.rate === 0.031 && back.scenarios[1].name === 'Æ Ø Å' && back.chosen === 2 && back.scenarios[0].data.rate === DEFAULTS.rate
      },
      expect: true,
    },
    {
      name: 'overføringskode: ugyldig tekst avvises',
      run: () => decodeStore('hei på deg') === null && decodeStore('EA1.%%%') === null,
      expect: true,
    },
    {
      name: 'sparemål: 1 mill igjen i 2036 gir nøyaktig det målet (etter skatt)',
      run: () => Math.round(runPlan({ ...DEFAULTS, targetEnabled: true, targetClosing: 1000000 }).summary.closingAfterTax),
      expect: 1000000,
    },
    {
      name: 'pensjon: ingen pensjon i 2027, full månedspensjon fra 2029',
      run: () => { const y = runPlan(DEFAULTS).years; return y[0].pension === 0 && Math.round(y[2].folkMonthly) > 30700 * 1.02 },
      expect: true,
    },
    {
      name: 'pensjon: 2028 har 7 av 12 måneder (fra 1. juni)',
      run: () => { const y = runPlan(DEFAULTS).years[1]; return Math.round(y.pensionFolk / (y.folkMonthly * 12) * 366) },
      expect: 214,
    },
  ]

  const results = cases.map((c) => {
    let actual, ok, err = null
    try {
      actual = c.run()
      ok = typeof c.expect === 'boolean' ? actual === c.expect : Math.abs(actual - c.expect) < 1
    } catch (e) {
      err = e.message
      ok = false
    }
    return { Test: c.name, OK: ok, Forventet: c.expect, Fikk: err ? `Feil: ${err}` : actual }
  })

  const allOk = results.every((r) => r.OK)
  if (allOk) {
    console.log('%cEiendomsalg-kalkulator: alle selvtester OK ✓', 'color:#2f6f5e;font-weight:bold')
  } else {
    console.warn('Eiendomsalg-kalkulator: en eller flere selvtester feilet. Se tabell:')
  }
  console.table(results)
  return allOk
}
