// Regnemotor for tiårsplanen (2027–2036).
//
// Prinsipper:
//  - Renter beregnes dag for dag på det som faktisk står på konto (enkel rente, dagtall/årets lengde)
//    og krediteres kontoen 31.12. Beløp som er utbetalt, tjener altså ikke renter etter utbetalingsdato.
//  - Skatt regnes per inntektsår med dagens regler (parametre kan overstyres i appen).
//  - Skatt som følge av kapital (renter, eiendomsgevinst, formue) betales fra kapitalen:
//    en andel som forskuddsskatt i inntektsåret, resten som restskatt året etter.
//    Skatt på pensjon trekkes fra pensjonen (skattekort) og berører ikke kapitalen.
//  - «Netto avkastning» = renter − skatt på renter − formuesskatt. I automodus tas den ut
//    jevnt gjennom året, slik at kapitalen står uendret (bortsett fra planlagte utbetalinger).
//  - Fordi skatt og uttak avhenger av årets renter, og rentene av hva som er betalt og tatt ut,
//    løses hvert år iterativt til tallene stabiliserer seg (under 1 kr avvik).
import { tax2027, wealthTax2027, primaryResidenceTaxValue } from './engineV2.js'

export const FIRST_YEAR = 2027
export const YEARS = 10

const DAY = 86400000
const dn = (y, m, d) => Date.UTC(y, m - 1, d) / DAY // dagnummer (UTC, ingen sommertid-feil)
export const dayToDate = (n) => new Date(n * DAY)
const yearOfDay = (n) => dayToDate(n).getUTCFullYear()
export function parseDay(s, fallback) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''))
  return m ? dn(+m[1], +m[2], +m[3]) : fallback
}
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const daysInYear = (y) => (isLeap(y) ? 366 : 365)
const num = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
const has = (v) => typeof v === 'number' && Number.isFinite(v)

function taxParams(g) {
  return {
    personfradrag: g.personfradrag,
    trinn: [1, 2, 3, 4, 5].map((i) => ({ fra: g['trinn' + i + 'Fra'], sats: g['trinn' + i + 'Sats'] })),
    trygdeLonn: g.trygdeLonn, trygdePensjon: g.trygdePensjon,
    mfLonnSats: g.mfLonnSats, mfLonnTak: g.mfLonnTak,
    mfPensjonSats: g.mfPensjonSats, mfPensjonTak: g.mfPensjonTak,
    fellesskattSats: g.fellesskattSats,
    pensionCreditMax: g.pensionCreditMax, pensionStep1: g.pensionStep1, pensionStep2: g.pensionStep2,
    pensionRate1: g.pensionRate1, pensionRate2: g.pensionRate2,
  }
}
const wealthParams = (g) => ({
  bunnfradragSingle: g.formueBunnfradrag, trinn2BreddeSingle: g.formueTrinn2Bredde,
  sats1: g.formueSats1, sats2: g.formueSats2,
})
const homeParams = (g) => ({ tak: g.primaerboligTak, satsUnder: g.primaerboligSatsUnder, satsOver: g.primaerboligSatsOver })

// Effektive verdier per år. Pensjon og rente «arves» fra året før (pensjon med årlig økning),
// med mindre brukeren har overstyrt året. `defaults` viser hva året ville fått uten overstyring.
export function yearInputs(g) {
  const growth = num(g.pensionGrowth)
  const tjStart = parseDay(g.tjenesteStart, null)
  const tjStartYear = tjStart === null ? FIRST_YEAR : yearOfDay(tjStart)
  const out = []
  for (let i = 0; i < YEARS; i++) {
    const y = FIRST_YEAR + i
    const o = (g.yr && g.yr[y]) || {}
    const prev = out[i - 1]
    const d = {
      folk: prev ? prev.folkMonthly * (1 + growth) : num(g.folkMonthly),
      tjeneste: y <= tjStartYear ? num(g.tjenesteMonthly) : prev.tjenesteMonthly * (1 + growth),
      rate: prev ? prev.rate : num(g.rate),
    }
    const folk = has(o.folk) ? o.folk : d.folk
    const tj = has(o.tjeneste) ? o.tjeneste : d.tjeneste
    const rate = has(o.rate) ? o.rate : d.rate
    const yStart = dn(y, 1, 1), yEnd = dn(y + 1, 1, 1)
    const frac = tjStart === null ? 0 : Math.min(1, Math.max(0, (yEnd - Math.max(tjStart, yStart)) / (yEnd - yStart)))
    out.push({
      year: y, defaults: d, overrides: o,
      rate, folkMonthly: folk, tjenesteMonthly: tj, tjenesteFraction: frac,
      pensionFolk: folk * 12, pensionTjeneste: tj * 12 * frac,
      withdrawalFixed: has(o.withdrawal) ? o.withdrawal : null,
    })
  }
  return out
}

export function runPlan(g) {
  const warnings = []
  const tp = taxParams(g), wp = wealthParams(g), hp = homeParams(g)
  const share = Math.min(1, Math.max(0, num(g.advanceShare, 1)))
  const advMonth = Math.min(12, Math.max(1, Math.round(num(g.advanceMonth, 9))))
  const taxMonth = Math.min(12, Math.max(1, Math.round(num(g.taxPaymentMonth, 8))))
  const inflation = num(g.inflation)

  // ---- Salget ----
  const saleDay = parseDay(g.sale, dn(2027, 1, 15))
  const settleDay = saleDay + Math.max(0, num(g.buffer))
  if (yearOfDay(saleDay) !== FIRST_YEAR) warnings.push('Salgsdatoen må ligge i 2027 i denne versjonen. Beregningen er ikke pålitelig for andre datoer.')
  const total = num(g.total), debt = num(g.debt), saleCost = num(g.saleCost)
  const initial = total - debt - saleCost
  const land = num(g.land)
  const taxableLand = Math.max(0, Math.min(land, total))
  const allocatedSaleCost = saleCost * (total > 0 ? taxableLand / total : 0)
  const landGain = g.landTaxable ? Math.max(0, land - allocatedSaleCost - num(g.landCost) - num(g.landImprovements)) : 0
  const residenceGain = g.residenceGainTaxFree ? 0
    : Math.max(0, total - land - num(g.purchaseTotal) - num(g.acquisitionCosts) - num(g.propertyImprovements) - saleCost + allocatedSaleCost)
  const gain = landGain + residenceGain
  const salaryAnnual = num(g.salary) * Math.min(12, Math.max(0, Number(g.salaryMonths) || 0))
  const rentIncome = num(g.rent) * 12 * Math.max(0, dn(FIRST_YEAR + 1, 1, 1) - saleDay) / 365
  const rentTaxable = g.rentTaxable ? rentIncome : 0

  // ---- Ny bolig ----
  const homePrice = num(g.homePrice)
  const homeDay = parseDay(g.homeDate, null)
  const docFee = g.homeDocFee ? homePrice * num(g.homeDocFeeRate) : 0
  const home = {
    price: homePrice, docFee, costs: num(g.homeCosts), improvements: num(g.homeImprovements),
    total: homePrice + docFee + num(g.homeCosts) + num(g.homeImprovements),
  }

  const inputs = yearInputs(g)
  const lastDay = dn(FIRST_YEAR + YEARS, 1, 1)
  const payouts = (g.payouts || []).map((p) => ({ label: p.label || 'Utbetaling', day: parseDay(p.date, null), amount: num(p.amount) }))
  payouts.forEach((p) => {
    if (p.day === null) warnings.push(`Utbetalingen «${p.label}» mangler gyldig dato og er ikke med.`)
    else if (p.day < dn(FIRST_YEAR, 1, 1) || p.day >= lastDay) warnings.push(`Utbetalingen «${p.label}» ligger utenfor planperioden og er ikke med.`)
    else if (p.day < settleDay) warnings.push(`Utbetalingen «${p.label}» er datert før salgsoppgjøret er på konto.`)
  })
  if (homePrice > 0) {
    if (homeDay === null || homeDay < dn(FIRST_YEAR, 1, 1) || homeDay >= lastDay) warnings.push('Kjøpsdato for ny bolig mangler eller ligger utenfor planperioden. Boligen er ikke med.')
    else if (homeDay < settleDay) warnings.push('Kjøpsdato for ny bolig er før salgsoppgjøret er på konto.')
  }

  const years = []
  const events = []
  let open = 0
  let restDue = 0 // restskatt fra året før (uten rentetillegg)
  let negativeWarned = false

  for (const yi of inputs) {
    const y = yi.year
    const yStart = dn(y, 1, 1), yEnd = dn(y + 1, 1, 1)
    const isFirst = y === FIRST_YEAR

    // Faste hendelser dette året
    const base = []
    if (yearOfDay(settleDay) === y) base.push({ day: settleDay, kind: 'settlement', label: 'Salgsoppgjør på konto (netto etter gjeld og omkostninger)', amount: initial, prio: 0 })
    payouts.forEach((p) => {
      if (p.day !== null && p.day >= yStart && p.day < yEnd && p.amount !== 0) base.push({ day: p.day, kind: 'payout', label: p.label, amount: -p.amount, prio: 1 })
    })
    if (homePrice > 0 && homeDay !== null && homeDay >= yStart && homeDay < yEnd) {
      base.push({ day: homeDay, kind: 'home', label: 'Kjøp av ny bolig (inkl. avgift og omkostninger)', amount: -home.total, prio: 1 })
    }
    let restPaid = 0, restInterest = 0
    if (restDue > 0.5) {
      const payDay = dn(y, taxMonth, 20)
      restInterest = restDue * num(g.taxAuthorityRate) * Math.max(0, payDay - dn(y - 1, 7, 1)) / 365
      restPaid = restDue + restInterest
      base.push({ day: payDay, kind: 'restskatt', label: `Restskatt ${y - 1} (inkl. rentetillegg)`, amount: -restPaid, prio: 2 })
    }
    // Uttaksdatoer (15. hver måned etter at salgsoppgjøret er mottatt)
    const wDays = []
    for (let m = 1; m <= 12; m++) {
      const d = dn(y, m, 15)
      if (d > settleDay) wDays.push(d)
    }

    const sim = (F, W) => {
      const evs = base.slice()
      if (F > 0.005) evs.push({ day: dn(y, advMonth, 15), kind: 'forskudd', label: `Forskuddsskatt ${y}`, amount: -F, prio: 2 })
      if (W > 0.005 && wDays.length) wDays.forEach((d) => evs.push({ day: d, kind: 'uttak', label: 'Uttak til livsopphold', amount: -W / wDays.length, prio: 3 }))
      evs.sort((a, b) => a.day - b.day || a.prio - b.prio)
      let bal = open, cursor = yStart, accrued = 0, minBal = open, minDay = yStart
      const log = []
      for (const e of evs) {
        accrued += Math.max(0, bal) * yi.rate * (e.day - cursor) / daysInYear(y)
        cursor = e.day
        bal += e.amount
        log.push({ ...e, year: y, balance: bal })
        if (bal < minBal) { minBal = bal; minDay = e.day }
      }
      accrued += Math.max(0, bal) * yi.rate * (yEnd - cursor) / daysInYear(y)
      return { log, interest: accrued, close: bal + accrued, minBal, minDay }
    }

    const salary = isFirst ? salaryAnnual : 0
    const rentTx = isFirst ? rentTaxable : 0
    const gainY = isFirst ? gain : 0
    const pension = yi.pensionFolk + yi.pensionTjeneste
    const creditBasis = g.tjenesteCredit ? pension : yi.pensionFolk
    const common = { salary, pension, creditBasis, ...tp }
    const tBase = tax2027({ ...common, interestIncome: 0, taxableRental: 0, taxablePropertyGain: 0 })

    const taxesFor = (s) => {
      const tNoGain = tax2027({ ...common, interestIncome: s.interest, taxableRental: rentTx, taxablePropertyGain: 0 })
      const tFull = tax2027({ ...common, interestIncome: s.interest, taxableRental: rentTx, taxablePropertyGain: gainY })
      const holdsHome = homePrice > 0 && homeDay !== null && homeDay <= dn(y, 12, 31)
      const homeValue = holdsHome ? primaryResidenceTaxValue(homePrice, hp) : 0
      const wealthNet = Math.max(0, s.close + homeValue + num(g.otherAssets) - num(g.otherDebt))
      const wealth = wealthTax2027(wealthNet, !!g.jointTaxation, wp)
      const interestTax = tNoGain.total - tBase.total
      const gainTax = tFull.total - tNoGain.total
      return { tNoGain, tFull, homeValue, wealthNet, wealth, interestTax, gainTax, capitalTax: interestTax + gainTax + wealth }
    }

    const auto = yi.withdrawalFixed === null
    const fixedW = auto ? 0 : yi.withdrawalFixed * (wDays.length / 12)
    let F = 0, Wauto = 0, s, t
    for (let it = 0; it < 80; it++) {
      s = sim(F, auto ? Wauto : fixedW)
      t = taxesFor(s)
      const Fn = share * t.capitalTax
      const Wn = auto ? Math.max(0, s.interest - t.interestTax - t.wealth) : 0
      const done = Math.abs(Fn - F) < 0.25 && Math.abs(Wn - Wauto) < 0.25
      F = Fn
      Wauto = Wn
      if (done) break
    }
    // Siste simulering brukte (nesten) samme F og W som de endelige verdiene; vi rapporterer det som faktisk ble simulert.
    const paidForskudd = s.log.filter((e) => e.kind === 'forskudd').reduce((a, e) => a - e.amount, 0)
    const withdrawals = s.log.filter((e) => e.kind === 'uttak').reduce((a, e) => a - e.amount, 0)
    const payoutsSum = s.log.filter((e) => e.kind === 'payout').reduce((a, e) => a - e.amount, 0)
    const homeOut = s.log.filter((e) => e.kind === 'home').reduce((a, e) => a - e.amount, 0)
    const settlementIn = s.log.filter((e) => e.kind === 'settlement').reduce((a, e) => a + e.amount, 0)
    const netReturn = s.interest - t.interestTax - t.wealth
    const trekkPensjon = tBase.total // skatt på pensjon (og evt. lønn) alene, trekkes fra pensjonen
    const pensionNet = salary + pension - trekkPensjon
    const realFactor = 1 / Math.pow(1 + inflation, y - FIRST_YEAR)
    const disposablePerMonth = (pensionNet + withdrawals) / 12

    if (s.minBal < -0.5 && !negativeWarned) {
      negativeWarned = true
      warnings.push(`Saldoen blir negativ første gang i ${y} (laveste ${Math.round(s.minBal).toLocaleString('nb-NO')} kr, ${dayToDate(s.minDay).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}). Planen er da ikke dekket av kapitalen, og tallene fra dette året er ikke pålitelige.`)
    }

    years.push({
      year: y, rate: yi.rate, open, close: s.close, minBal: s.minBal,
      interest: s.interest, interestTax: t.interestTax, gainTax: t.gainTax, wealthNet: t.wealthNet, wealthTax: t.wealth,
      capitalTax: t.capitalTax, forskudd: paidForskudd, restPaid, restInterest, restNext: (1 - share) * t.capitalTax,
      withdrawals, auto, payouts: payoutsSum, homeOut, settlementIn,
      folkMonthly: yi.folkMonthly, tjenesteMonthly: yi.tjenesteMonthly, tjenesteFraction: yi.tjenesteFraction,
      pensionFolk: yi.pensionFolk, pensionTjeneste: yi.pensionTjeneste, pension, salary,
      trekkPensjon, pensionNet, pensionCredit: t.tNoGain.pensionCredit, taxTotalAll: t.tFull.total,
      netReturn, netReturnPerMonth: netReturn / 12,
      disposablePerMonth, disposablePerMonthReal: disposablePerMonth * realFactor, realFactor,
      homeValue: t.homeValue,
    })
    events.push(...s.log, { day: yEnd - 1, kind: 'interest', year: y, label: `Renter ${y} kreditert kontoen`, amount: s.interest, balance: s.close, prio: 9 })

    restDue = (1 - share) * t.capitalTax
    open = s.close
  }

  const sum = (k) => years.reduce((a, r) => a + r[k], 0)
  // «Stabilt år» = første hele år etter siste utbetaling/boligkjøp. Snittene bruker disse årene,
  // fordi oppstartsårene (kapitalen er ikke ferdig fordelt) gir et skjevt bilde av hverdagen.
  const lastEventYear = Math.max(
    yearOfDay(settleDay),
    ...payouts.filter((p) => p.day !== null && p.amount !== 0).map((p) => yearOfDay(p.day)),
    homePrice > 0 && homeDay !== null ? yearOfDay(homeDay) : FIRST_YEAR,
  )
  const steadyFrom = Math.min(FIRST_YEAR + YEARS - 1, lastEventYear + 1)
  const steady = years.filter((r) => r.year >= steadyFrom)
  const avg = (k) => steady.reduce((a, r) => a + r[k], 0) / steady.length
  const last = years[years.length - 1]
  const summary = {
    initial, gain, landGain, residenceGain, home,
    totalInterest: sum('interest'), totalInterestTax: sum('interestTax'), totalWealthTax: sum('wealthTax'), totalGainTax: sum('gainTax'),
    totalNetReturn: sum('netReturn'),
    steadyFrom,
    avgNetReturnPerMonth: avg('netReturn') / 12,
    avgPensionNetPerMonth: avg('pensionNet') / 12,
    avgDisposablePerMonth: avg('disposablePerMonth'),
    avgDisposablePerMonthReal: avg('disposablePerMonthReal'),
    closing: last.close, outstandingTax: restDue,
    closingAfterTax: last.close - restDue,
    closingReal: (last.close - restDue) / Math.pow(1 + inflation, YEARS - 1),
  }
  return { years, events, warnings: [...new Set(warnings)], summary, home }
}
