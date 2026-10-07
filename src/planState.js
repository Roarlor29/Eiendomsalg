// Standardverdier, grenser og lagring i nettleseren (localStorage).
// Alt som brukeren skriver inn lagres automatisk på denne enheten (ikke på en server).

export const STORAGE_KEY = 'eiendomsalg-v3-plan'
const OLD_STORAGE_KEY = 'eiendomsalg-v2-inputs-v3' // forrige versjon (lagret per feltnavn)

export const DEFAULTS = {
  // Salget
  sale: '2027-01-15', buffer: 14, total: 28000000, debt: 10500000, saleCost: 0,
  land: 0, landCost: 2000000, landImprovements: 0, landTaxable: true,
  purchaseTotal: 0, acquisitionCosts: 0, propertyImprovements: 0, residenceGainTaxFree: true,
  // Øvrig 2027
  salary: 75000, salaryMonths: 1, rent: 18500, rentTaxable: false,
  otherAssets: 0, otherDebt: 0, jointTaxation: false,
  // Utbetalinger fra kapitalen
  payouts: [{ id: 1, label: 'Oppgjør til samboer', date: '2027-08-15', amount: 5000000 }],
  // Ny bolig
  homePrice: 7500000, homeDate: '2028-01-15', homeDocFee: true, homeDocFeeRate: 0.025, homeCosts: 0, homeImprovements: 0,
  // Pensjon, avkastning, inflasjon
  folkMonthly: 30700, tjenesteMonthly: 8500, tjenesteStart: '2028-05-29', tjenesteCredit: false,
  pensionGrowth: 0.025, rate: 0.04, inflation: 0.025,
  // Sparemål: hvor mye kapital som skal stå igjen 31.12.2036 (etter skatt). Resten kan brukes.
  targetEnabled: false, targetClosing: 1000000,
  // Betaling av skatt
  advanceShare: 1, advanceMonth: 9, taxPaymentMonth: 8, taxAuthorityRate: 0.0312,
  // Overstyring per år: { 2028: { rate: .035, folk: 31500, tjeneste: 9000, withdrawal: 400000 } }
  yr: {},
  // Inntektsskatt (sist kjente satser, kan overstyres)
  personfradrag: 114540, trygdeLonn: 0.076, trygdePensjon: 0.051,
  mfLonnSats: 0.46, mfLonnTak: 95700, mfPensjonSats: 0.4, mfPensjonTak: 75400, fellesskattSats: 0.22,
  pensionCreditMax: 37100, pensionStep1: 284950, pensionStep2: 436050, pensionRate1: 0.167, pensionRate2: 0.06,
  trinn1Fra: 226100, trinn1Sats: 0.017, trinn2Fra: 318300, trinn2Sats: 0.04, trinn3Fra: 725050, trinn3Sats: 0.137,
  trinn4Fra: 980100, trinn4Sats: 0.168, trinn5Fra: 1467200, trinn5Sats: 0.178,
  // Formuesskatt (bunnfradrag og trinnbredde gjelder enslig, dobles ved felles ligning)
  formueBunnfradrag: 1900000, formueTrinn2Bredde: 19600000, formueSats1: 0.01, formueSats2: 0.011,
  primaerboligTak: 14000000, primaerboligSatsUnder: 0.25, primaerboligSatsOver: 0.7,
}

const RATE = { min: 0, max: 2 }
export const CLAMP = {
  rate: RATE, inflation: { min: 0, max: 1 }, pensionGrowth: { min: 0, max: 1 }, taxAuthorityRate: RATE,
  homeDocFeeRate: { min: 0, max: 0.2 }, advanceShare: { min: 0, max: 1 },
  advanceMonth: { min: 1, max: 12 }, taxPaymentMonth: { min: 1, max: 12 },
  buffer: { min: 0, max: 365 }, salaryMonths: { min: 0, max: 12 },
  trygdeLonn: RATE, trygdePensjon: RATE, mfLonnSats: RATE, mfPensjonSats: RATE, fellesskattSats: RATE,
  pensionRate1: RATE, pensionRate2: RATE, formueSats1: RATE, formueSats2: RATE,
  primaerboligSatsUnder: RATE, primaerboligSatsOver: RATE,
  trinn1Sats: RATE, trinn2Sats: RATE, trinn3Sats: RATE, trinn4Sats: RATE, trinn5Sats: RATE,
}
export const MAX_MONEY = 1e11 // 100 mrd. kr: fanger skrivefeil og ødelagte lagrede verdier
export const clampMoney = (v) => Math.min(MAX_MONEY, Math.max(0, v))
export const clampField = (key, v) => {
  const c = CLAMP[key]
  if (!c) return clampMoney(v)
  return Math.min(c.max, Math.max(c.min, v))
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

// Rydder opp i lagrede data slik at ødelagte eller manipulerte verdier aldri kan krasje appen.
function sanitize(raw) {
  const out = { ...DEFAULTS, payouts: DEFAULTS.payouts.map((p) => ({ ...p })), yr: {} }
  if (!raw || typeof raw !== 'object') return out
  for (const key of Object.keys(DEFAULTS)) {
    if (key === 'payouts' || key === 'yr' || !(key in raw)) continue
    const def = DEFAULTS[key], v = raw[key]
    if (typeof def === 'number' && isNum(v)) out[key] = clampField(key, v)
    else if (typeof def === 'boolean' && typeof v === 'boolean') out[key] = v
    else if (typeof def === 'string' && isDate(v)) {
      if (key === 'sale' && !v.startsWith('2027-')) continue // salget må ligge i 2027
      out[key] = v
    }
  }
  if (Array.isArray(raw.payouts)) {
    out.payouts = raw.payouts.slice(0, 30)
      .filter((p) => p && typeof p === 'object')
      .map((p, i) => ({
        id: isNum(p.id) ? p.id : i + 1,
        label: typeof p.label === 'string' ? p.label.slice(0, 60) : 'Utbetaling',
        date: isDate(p.date) ? p.date : '2027-08-15',
        amount: isNum(p.amount) ? clampMoney(p.amount) : 0,
      }))
  }
  if (raw.yr && typeof raw.yr === 'object') {
    for (const [y, o] of Object.entries(raw.yr)) {
      if (!/^\d{4}$/.test(y) || !o || typeof o !== 'object') continue
      const clean = {}
      if (isNum(o.rate)) clean.rate = clampField('rate', o.rate)
      for (const k of ['folk', 'tjeneste', 'withdrawal']) if (isNum(o[k])) clean[k] = clampMoney(o[k])
      if (Object.keys(clean).length) out.yr[y] = clean
    }
  }
  return out
}

// Overføring fra forrige versjon av appen (lagret etter feltnavn). Pensjon og rente tas ikke med,
// fordi de betyr noe annet i tiårsmodellen.
const OLD_LABELS = {
  Salgstidspunkt: 'sale', Salgssum: 'total', 'Skattepliktig tomteandel': 'land', Tomtekostpris: 'landCost',
  'Påkostninger tomt': 'landImprovements', Salgsomkostninger: 'saleCost', 'Gjeld før salg': 'debt',
  'Ny bolig': 'homePrice', 'Opprinnelig eiendomsverdi': 'purchaseTotal', Kjøpskostnader: 'acquisitionCosts',
  'Påkostninger bolig': 'propertyImprovements', 'Andre eiendeler': 'otherAssets', 'Annen gjeld': 'otherDebt',
  'Lønn/mnd i 2027': 'salary', 'Antall arbeidsmåneder 2027': 'salaryMonths', 'Leie/mnd i 2027': 'rent',
  'Forventet betalingsmåned restskatt 2028': 'taxPaymentMonth',
  'Boliggevinst er skattefri etter eier-/brukstidsreglene': 'residenceGainTaxFree',
  'Tomteandelen over naturlig arrondert tomt er skattepliktig': 'landTaxable',
  'Leieinntekten er skattepliktig': 'rentTaxable',
  'Gift/registrert partner/meldepliktig samboer – skattlegges samlet': 'jointTaxation',
}
function migrateOld(data) {
  const raw = {}
  for (const [label, key] of Object.entries(OLD_LABELS)) {
    if (!(label in data)) continue
    const def = DEFAULTS[key], v = data[label]
    if (typeof def === 'boolean') raw[key] = Boolean(v)
    else if (typeof def === 'number') raw[key] = Number(v)
    else raw[key] = v
  }
  return raw
}

// Helt nye standardverdier for ett scenario.
export const freshState = () => sanitize(null)

// ---------------------------------------------------------------------------
// Tre uavhengige scenarioer. Hvert scenario har sitt eget komplette sett med inndata,
// og beregnes helt for seg. «chosen» er scenarioet brukeren har valgt som sitt (eller null).
// ---------------------------------------------------------------------------
export const STORE_KEY = 'eiendomsalg-v4-scenarios'
export const SCENARIO_IDS = [1, 2, 3]
const DEFAULT_NAMES = { 1: 'Scenario A', 2: 'Scenario B', 3: 'Scenario C' }
export const MAX_NAME = 30
const deepCopy = (o) => JSON.parse(JSON.stringify(o))

export const freshStore = () => ({
  v: 4,
  scenarios: SCENARIO_IDS.map((id) => ({ id, name: DEFAULT_NAMES[id], data: sanitize(null) })),
  chosen: null,
  active: 1,
})

// Eksisterende enkeltscenario (fra forrige versjon) blir Scenario A. B og C starter som kopier,
// slik at du kan endre dem og sammenligne.
const storeFromSingle = (data) => ({
  v: 4,
  scenarios: SCENARIO_IDS.map((id) => ({ id, name: DEFAULT_NAMES[id], data: deepCopy(data) })),
  chosen: null,
  active: 1,
})

export function sanitizeStore(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.scenarios)) return freshStore()
  const scenarios = SCENARIO_IDS.map((id) => {
    const found = raw.scenarios.find((s) => s && typeof s === 'object' && s.id === id)
    const name = found && typeof found.name === 'string' ? found.name.trim().slice(0, MAX_NAME) : ''
    return { id, name: name || DEFAULT_NAMES[id], data: sanitize(found ? found.data : null) }
  })
  const chosen = SCENARIO_IDS.includes(raw.chosen) ? raw.chosen : null
  // Det valgte scenarioet vises først når appen åpnes.
  const active = chosen ?? (SCENARIO_IDS.includes(raw.active) ? raw.active : 1)
  return { v: 4, scenarios, chosen, active }
}

export function loadStore() {
  try {
    const cur = localStorage.getItem(STORE_KEY)
    if (cur) return sanitizeStore(JSON.parse(cur))
    const v3 = localStorage.getItem(STORAGE_KEY)
    if (v3) return storeFromSingle(sanitize(JSON.parse(v3)))
    const old = localStorage.getItem(OLD_STORAGE_KEY)
    if (old) return storeFromSingle(sanitize(migrateOld(JSON.parse(old))))
  } catch { /* ingen lagring tilgjengelig (f.eks. privat modus) – bruk standardverdier */ }
  return freshStore()
}

export function saveStore(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)) } catch { /* ignorer */ }
}

// Sletter alt som er lagret, også eldre versjoner (ellers ville de blitt hentet inn igjen).
export function clearAll() {
  try {
    ;[STORE_KEY, STORAGE_KEY, OLD_STORAGE_KEY].forEach((k) => localStorage.removeItem(k))
  } catch { /* ignorer */ }
}

export const copyScenarioData = (data) => deepCopy(data)

// ---------------------------------------------------------------------------
// Overføring mellom enheter. Alt lagres i nettleseren på hver enhet, så scenarioene pakkes i en
// kort kode (bare felt som avviker fra standardverdiene tas med) som kan sendes som tekst eller lenke.
// ---------------------------------------------------------------------------
const CODE_PREFIX = 'EA1.'
const toB64 = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64 = (b) => decodeURIComponent(escape(atob(b.replace(/-/g, '+').replace(/_/g, '/'))))

export function encodeStore(store) {
  const slim = {
    v: 4, chosen: store.chosen, active: store.active,
    scenarios: store.scenarios.map((sc) => {
      const d = {}
      for (const k of Object.keys(DEFAULTS)) {
        if (k === 'payouts' || k === 'yr') continue
        if (sc.data[k] !== DEFAULTS[k]) d[k] = sc.data[k]
      }
      d.payouts = sc.data.payouts
      d.yr = sc.data.yr
      return { id: sc.id, name: sc.name, data: d }
    }),
  }
  return CODE_PREFIX + toB64(JSON.stringify(slim))
}

// Tar imot koden, eller hele lenken med koden bak «#d=». Gir null hvis teksten ikke er en gyldig kode.
export function decodeStore(text) {
  try {
    let t = String(text || '').trim()
    const i = t.indexOf('#d=')
    if (i >= 0) t = t.slice(i + 3)
    t = t.replace(/\s+/g, '')
    if (!t.startsWith(CODE_PREFIX)) return null
    const raw = JSON.parse(fromB64(t.slice(CODE_PREFIX.length)))
    if (!raw || !Array.isArray(raw.scenarios)) return null
    return sanitizeStore(raw)
  } catch { return null }
}
