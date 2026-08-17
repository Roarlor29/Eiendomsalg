import { useState, useMemo } from 'react'


// ---------- Formatting helpers ----------
const kr = (n) =>
  (isFinite(n) ? Math.round(n) : 0).toLocaleString("nb-NO", { maximumFractionDigits: 0 }) + " kr";
const krSigned = (n) => (n < 0 ? "− " : "") + kr(Math.abs(n));
const pct = (n) => (n * 100).toFixed(1).replace(".", ",") + " %";
const dfmt = (d) =>
  d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
const addDays = (d, n) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const addMonths = (d, n) => {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
};
const daysBetween = (a, b) => (b - a) / 86400000;
const overlapDays = (aStart, aEnd, bStart, bEnd) => {
  const s = new Date(Math.max(aStart.getTime(), bStart.getTime()));
  const e = new Date(Math.min(aEnd.getTime(), bEnd.getTime()));
  return Math.max(0, daysBetween(s, e));
};
const yearBounds = (y) => [new Date(y, 0, 1), new Date(y + 1, 0, 1)];

// ---------- Default 2026 tax parameters (best available estimate; 2027-satser fastsettes først i statsbudsjettet des. 2026) ----------
const DEFAULTS = {
  totalSalgssum: 23000000,
  tomtAndel: 3500000, // slider 2M-6M, bolig = total - tomt
  kostpris_bolig: 2000000,
  kostpris_tomt: 2000000,
  gevinstskattSats: 0.22,
  gjeld: 10500000,
  bufferDager: 14,

  nyBoligKjopesum: 7500000,
  dagerTilNyBolig: 90,
  pengemarkedRente: 0.05,
  renteSkattSats: 0.22,
  skatteforfallManed: 9, // restskatt forfaller normalt ved skatteoppgjøret høsten året etter salgsåret
  skatteforfallDag: 1,

  lonnBruttoMnd: 75000,
  // Scenario A/C: lønnsslutt = salgsdato + oppsigelsestid (generisk regel, knyttet til salgstidspunktet)
  oppsigelsestidMndGenerisk: 3,
  // Scenario B: jobber fast til og med januar 2027, oppsigelse løper fra en gitt dato,
  // med inntil X måneders oppsigelsestid hvis arbeidsgiver krever det
  oppsigelseStartDatoB: "2027-02-01",
  oppsigelsestidMndB: 3,
  // Bonus opparbeidet i 2026, mulig utbetalt i 2027 - mottas kun hvis fortsatt ansatt ved utbetaling
  bonusBelop: 0,
  bonusUtbetalingsDato: "2027-03-01",
  pensjonBruttoMnd: 31000,
  pensjonStartDato: "2026-09-01",
  leieinntektMnd: 18500,

  // trinnskatt 2026 (vedtatt, Prop. 1 LS 2025-2026)
  trinn: [
    { fra: 226100, sats: 0.017 },
    { fra: 318300, sats: 0.04 },
    { fra: 725050, sats: 0.137 },
    { fra: 980100, sats: 0.168 },
    { fra: 1467200, sats: 0.178 },
  ],
  trygdeLonn: 0.076,
  trygdePensjon: 0.051,
  mfLonnSats: 0.46,
  mfLonnTak: 95700,
  mfPensjonSats: 0.4,
  mfPensjonTak: 75400,
  personfradrag: 114540,
  fellesskattSats: 0.22,

  skattefradragPensjonistMax: 37100,
  pensjonistUtfasingStart: 284950,
  pensjonistUtfasingSlutt: 436050,
  pensjonistUtfasingSats: 0.167,

  formueBunnfradrag: 1900000,
  formueTrinn2: 21500000,
  formueSats1: 0.01,
  formueSats2: 0.011,
  primaerboligTak: 10000000,
  primaerboligSatsUnder: 0.25,
  primaerboligSatsOver: 0.7,
};

function trinnskatt(personinntekt, trinn) {
  let tax = 0;
  for (let i = 0; i < trinn.length; i++) {
    const lower = trinn[i].fra;
    const upper = i < trinn.length - 1 ? trinn[i + 1].fra : Infinity;
    if (personinntekt > lower) tax += (Math.min(personinntekt, upper) - lower) * trinn[i].sats;
  }
  return tax;
}

function formuesverdiPrimaerbolig(marketValue, p) {
  if (marketValue <= p.primaerboligTak) return marketValue * p.primaerboligSatsUnder;
  return (
    p.primaerboligTak * p.primaerboligSatsUnder +
    (marketValue - p.primaerboligTak) * p.primaerboligSatsOver
  );
}

function formuesskatt(nettoFormue, p) {
  const grunnlag = Math.max(0, nettoFormue - p.formueBunnfradrag);
  if (grunnlag <= 0) return 0;
  const under = Math.min(grunnlag, p.formueTrinn2 - p.formueBunnfradrag);
  const over = Math.max(0, grunnlag - (p.formueTrinn2 - p.formueBunnfradrag));
  return under * p.formueSats1 + over * p.formueSats2;
}

function incomeTaxForYear(lonn, pensjon, gevinstTomt, renteinntekt, p) {
  const personinntekt = lonn + pensjon;
  const trinnTax = trinnskatt(personinntekt, p.trinn);
  const trygdeLonn = lonn * p.trygdeLonn;
  const trygdePensjon = pensjon * p.trygdePensjon;
  const mfLonn = Math.min(lonn * p.mfLonnSats, p.mfLonnTak);
  const mfPensjon = Math.min(pensjon * p.mfPensjonSats, p.mfPensjonTak);
  const mfCombined = Math.min(mfLonn + mfPensjon, p.mfLonnTak);
  const alminneligInntektFor22 =
    lonn + pensjon - mfCombined + gevinstTomt + renteinntekt - p.personfradrag;
  const grunnlag22 = Math.max(0, alminneligInntektFor22);
  const fellesskatt = grunnlag22 * p.fellesskattSats;

  let credit = 0;
  if (pensjon > 0) {
    credit = p.skattefradragPensjonistMax;
    if (pensjon > p.pensjonistUtfasingStart) {
      credit -=
        (Math.min(pensjon, p.pensjonistUtfasingSlutt) - p.pensjonistUtfasingStart) *
        p.pensjonistUtfasingSats;
    }
    credit = Math.max(0, credit);
  }
  const sumForCredit = trinnTax + trygdeLonn + trygdePensjon + fellesskatt;
  credit = Math.min(credit, sumForCredit);
  const totalTax = Math.max(0, sumForCredit - credit);
  return { trinnTax, trygdeLonn, trygdePensjon, fellesskatt, credit, totalTax, personinntekt };
}

// ---------- Core scenario computation ----------
// Skatt på gevinst tomt og renteinntekt forfaller ikke ved oppgjør, men ved skatteoppgjøret
// (restskatt) høsten året etter salgsåret. Pengene ligger derfor i pengemarkedet og tjener
// renter helt fram til forfallsdatoen, ikke bare fram til boligkjøpet.
function computeScenario(saleDateStr, g, lonnSlutt) {
  const p = g;
  const saleDate = new Date(saleDateStr + "T00:00:00");
  const boligSum = g.totalSalgssum - g.tomtAndel;
  const gevinstTomt = Math.max(0, g.tomtAndel - g.kostpris_tomt);
  const skattGevinstTomt = gevinstTomt * g.gevinstskattSats;

  const oppgjorPaKonto = addDays(saleDate, g.bufferDager);
  const P0 = g.totalSalgssum - g.gjeld; // bruttobeløp til konto - skatt IKKE trukket ennå
  const nyBoligDato = addDays(oppgjorPaKonto, g.dagerTilNyBolig);
  const skatteforfallDato = new Date(
    saleDate.getFullYear() + 1,
    g.skatteforfallManed - 1,
    g.skatteforfallDag
  );

  // Periode 1: oppgjør -> boligkjøp (prinsipal P0)
  const dagerPeriode1 = Math.max(0, daysBetween(oppgjorPaKonto, nyBoligDato));
  const rente1 = P0 * g.pengemarkedRente * (dagerPeriode1 / 365);
  const P1 = P0 + rente1 - g.nyBoligKjopesum; // beholdning rett etter boligkjøp

  // Periode 2: boligkjøp -> skatteoppgjør/forfall (prinsipal P1)
  const dagerPeriode2 = Math.max(0, daysBetween(nyBoligDato, skatteforfallDato));
  const rente2 = P1 * g.pengemarkedRente * (dagerPeriode2 / 365);

  const bruttoRenteTotal = rente1 + rente2;
  const skattRenteTotal = bruttoRenteTotal * g.renteSkattSats;
  const totalSkattVedForfall = skattGevinstTomt + skattRenteTotal;
  const beholdningForSkatteoppgjor = P1 + rente2;
  const nettoBeholdningEtterOppgjor = beholdningForSkatteoppgjor - totalSkattVedForfall;

  // Beholdning + skyldig-men-ikke-forfalt skatt på en gitt dato (for formuesskatt-beregning)
  function balanceAt(date) {
    if (date <= nyBoligDato) {
      const days = Math.max(0, daysBetween(oppgjorPaKonto, date));
      const interestSoFar = P0 * g.pengemarkedRente * (days / 365);
      return {
        homeOwned: false,
        cashGross: P0 + interestSoFar,
        taxOwed: skattGevinstTomt + interestSoFar * g.renteSkattSats,
        settled: false,
      };
    }
    if (date <= skatteforfallDato) {
      const days = Math.max(0, daysBetween(nyBoligDato, date));
      const interestP2SoFar = P1 * g.pengemarkedRente * (days / 365);
      const interestTotalSoFar = rente1 + interestP2SoFar;
      return {
        homeOwned: true,
        cashGross: P1 + interestP2SoFar,
        taxOwed: skattGevinstTomt + interestTotalSoFar * g.renteSkattSats,
        settled: false,
      };
    }
    return { homeOwned: true, cashGross: nettoBeholdningEtterOppgjor, taxOwed: 0, settled: true };
  }

  const pensjonStart = new Date(g.pensjonStartDato + "T00:00:00");
  const farPast = new Date(2000, 0, 1);
  const farFuture = new Date(2100, 0, 1);

  const bonusUtbetaling = new Date(g.bonusUtbetalingsDato + "T00:00:00");
  const bonusMottas = g.bonusBelop > 0 && lonnSlutt >= bonusUtbetaling;
  const bonusAr = (year) => (bonusMottas && bonusUtbetaling.getFullYear() === year ? g.bonusBelop : 0);

  function renteInYear(year) {
    const [yStart, yEnd] = yearBounds(year);
    const d1 = overlapDays(oppgjorPaKonto, nyBoligDato, yStart, yEnd);
    const d2 = overlapDays(nyBoligDato, skatteforfallDato, yStart, yEnd);
    return P0 * g.pengemarkedRente * (d1 / 365) + P1 * g.pengemarkedRente * (d2 / 365);
  }

  function yearBreakdown(year) {
    const [yStart, yEnd] = yearBounds(year);
    const lonnDager = overlapDays(farPast, lonnSlutt, yStart, yEnd);
    const pensjonDager = overlapDays(pensjonStart, farFuture, yStart, yEnd);
    const leieDager = overlapDays(farPast, saleDate, yStart, yEnd);

    const lonnAr = (g.lonnBruttoMnd * 12 * lonnDager) / 365;
    const bonusThisYear = bonusAr(year);
    const pensjonAr = (g.pensjonBruttoMnd * 12 * pensjonDager) / 365;
    const leieAr = (g.leieinntektMnd * 12 * leieDager) / 365;
    const renteAr = renteInYear(year);
    const gevinstTomtAr = saleDate.getFullYear() === year ? gevinstTomt : 0;

    // Merk: fellesskatt her regnes KUN av lønn/pensjon - skatt på gevinst tomt og renteinntekt
    // vises separat under (informasjon) og trekkes samlet ved skatteoppgjøret i "Pengemarked"-panelet,
    // for å unngå dobbelttelling. Bonus behandles skattemessig som lønn.
    const tax = incomeTaxForYear(lonnAr + bonusThisYear, pensjonAr, 0, 0, p);
    const skattRenteInfoAr = renteAr * g.renteSkattSats;
    const skattGevinstInfoAr = gevinstTomtAr * g.gevinstskattSats;

    return { year, lonnAr, bonusThisYear, pensjonAr, leieAr, renteAr, gevinstTomtAr, skattRenteInfoAr, skattGevinstInfoAr, tax };
  }

  function wealthAtYearEnd(year) {
    const dec31 = new Date(year, 11, 31);
    const boligMarkedsverdi = boligSum;
    if (saleDate > dec31) {
      const fv = formuesverdiPrimaerbolig(boligMarkedsverdi, p);
      return { netto: fv - g.gjeld, detail: `Bolig (formuesverdi ${kr(fv)}) − gjeld ${kr(g.gjeld)}` };
    }
    const b = balanceAt(dec31);
    const homeFv = b.homeOwned ? formuesverdiPrimaerbolig(g.nyBoligKjopesum, p) : 0;
    const netto = homeFv + b.cashGross - b.taxOwed;
    const detail = b.settled
      ? `Ny bolig (${kr(homeFv)}) + kontanter etter skatteoppgjør (${kr(b.cashGross)})`
      : `${b.homeOwned ? `Ny bolig (${kr(homeFv)}) + ` : ""}Pengemarked brutto (${kr(b.cashGross)}) − skyldig, ikke forfalt skatt (${kr(b.taxOwed)})`;
    return { netto, detail };
  }

  const y2026 = yearBreakdown(2026);
  const y2027 = yearBreakdown(2027);
  const w2026 = wealthAtYearEnd(2026);
  const w2027 = wealthAtYearEnd(2027);
  const fs2026 = formuesskatt(w2026.netto, p);
  const fs2027 = formuesskatt(w2027.netto, p);

  const totalSkattInntekt = y2026.tax.totalTax + y2027.tax.totalTax;
  const totalNettoInntekt =
    y2026.lonnAr +
    y2026.bonusThisYear +
    y2026.pensjonAr +
    y2026.leieAr +
    y2027.lonnAr +
    y2027.bonusThisYear +
    y2027.pensjonAr +
    y2027.leieAr -
    totalSkattInntekt;
  const totalFormuesskatt = fs2026 + fs2027;

  const sumAltDisponibelt = nettoBeholdningEtterOppgjor + totalNettoInntekt - totalFormuesskatt;

  return {
    saleDate,
    lonnSlutt,
    bonusMottas,
    bonusUtbetaling,
    bonusBelopConfigured: g.bonusBelop,
    boligSum,
    tomtSum: g.tomtAndel,
    gevinstTomt,
    skattGevinstTomt,
    nyBoligKjopesum: g.nyBoligKjopesum,
    P0,
    oppgjorPaKonto,
    nyBoligDato,
    dagerPeriode1,
    rente1,
    P1,
    dagerPeriode2,
    rente2,
    skatteforfallDato,
    bruttoRenteTotal,
    skattRenteTotal,
    totalSkattVedForfall,
    beholdningForSkatteoppgjor,
    nettoBeholdningEtterOppgjor,
    y2026,
    y2027,
    w2026,
    w2027,
    fs2026,
    fs2027,
    totalSkattInntekt,
    totalFormuesskatt,
    sumAltDisponibelt,
  };
}

// ---------- UI components ----------
function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function ScenarioCard({ title, subtitle, s, accent }) {
  return (
    <div className="scard" style={{ borderTopColor: accent }}>
      <div className="scard-head">
        <h3>{title}</h3>
        <span className="scard-sub">{subtitle}</span>
      </div>

      <div className="srow srow-total">
        <span>Netto disponibelt (kontant + inntekt − formuesskatt, 2026–27)</span>
        <b style={{ color: accent }}>{krSigned(s.sumAltDisponibelt)}</b>
      </div>

      <div className="ssection">
        <h4>Salgsoppgjør</h4>
        <div className="srow"><span>Bolig / Tomt</span><span>{kr(s.boligSum)} / {kr(s.tomtSum)}</span></div>
        <div className="srow"><span>Bruttosalgssum</span><span>{kr(s.boligSum + s.tomtSum)}</span></div>
        <div className="srow"><span>− Gjeld innfridd</span><span>− {kr(s.boligSum + s.tomtSum - s.P0)}</span></div>
        <div className="srow srow-em"><span>= Beløp til konto (skatt ikke trukket ennå)</span><b>{kr(s.P0)}</b></div>
        <div className="srow small"><span>Penger på konto</span><span>{dfmt(s.oppgjorPaKonto)}</span></div>
        <div className="srow small"><span>Gevinst tomt / skatt derav</span><span>{kr(s.gevinstTomt)} / {kr(s.skattGevinstTomt)}</span></div>
        <div className="srow small tinytext-inline"><span>↳ Denne skatten forfaller først ved skatteoppgjøret {dfmt(s.skatteforfallDato)} — pengene ligger i pengemarkedet og tjener renter fram til da (se under).</span></div>
      </div>

      <div className="ssection">
        <h4>Pengemarked → ny bolig → skatteoppgjør</h4>
        <div className="srow"><span>Beløp på konto ved oppgjør</span><span>{kr(s.P0)}</span></div>
        <div className="srow small"><span>+ Renter til boligkjøp ({Math.round(s.dagerPeriode1)} dager)</span><span>+ {kr(s.rente1)}</span></div>
        <div className="srow"><span>− Kjøpesum ny bolig ({dfmt(s.nyBoligDato)})</span><span>− {kr(s.nyBoligKjopesum)}</span></div>
        <div className="srow srow-em"><span>= Beholdning etter boligkjøp</span><b>{krSigned(s.P1)}</b></div>
        <div className="srow small"><span>+ Renter til skatteoppgjør ({Math.round(s.dagerPeriode2)} dager)</span><span>+ {kr(s.rente2)}</span></div>
        <div className="srow"><span>= Beholdning før skatteoppgjør (brutto)</span><b>{krSigned(s.beholdningForSkatteoppgjor)}</b></div>
        <div className="srow small"><span>− Skatt gevinst tomt</span><span>− {kr(s.skattGevinstTomt)}</span></div>
        <div className="srow small"><span>− Skatt renteinntekt ({kr(s.bruttoRenteTotal)} totalt)</span><span>− {kr(s.skattRenteTotal)}</span></div>
        <div className="srow srow-total-mini"><span>Netto beholdning etter skatteoppgjør ({dfmt(s.skatteforfallDato)})</span><b>{krSigned(s.nettoBeholdningEtterOppgjor)}</b></div>
      </div>

      <div className="ssection">
        <h4>Løpende inntekt & skatt</h4>
        <div className="srow small"><span>Siste lønnsdag</span><span>{dfmt(s.lonnSlutt)}</span></div>
        {s.bonusBelopConfigured > 0 && (
          <div className="srow small">
            <span>Bonus ({dfmt(s.bonusUtbetaling)})</span>
            <span style={{ color: s.bonusMottas ? "var(--good)" : "var(--bad)" }}>
              {s.bonusMottas ? "mottas" : "bortfaller — sluttet før utbetaling"}
            </span>
          </div>
        )}
        <table className="ytable">
          <thead><tr><th></th><th>2026</th><th>2027</th></tr></thead>
          <tbody>
            <tr><td>Lønn</td><td>{kr(s.y2026.lonnAr)}</td><td>{kr(s.y2027.lonnAr)}</td></tr>
            <tr><td>Bonus</td><td>{kr(s.y2026.bonusThisYear)}</td><td>{kr(s.y2027.bonusThisYear)}</td></tr>
            <tr><td>Pensjon</td><td>{kr(s.y2026.pensjonAr)}</td><td>{kr(s.y2027.pensjonAr)}</td></tr>
            <tr><td>Leieinntekt (skattefri)</td><td>{kr(s.y2026.leieAr)}</td><td>{kr(s.y2027.leieAr)}</td></tr>
            <tr className="subtotal"><td>Trinnskatt</td><td>{kr(s.y2026.tax.trinnTax)}</td><td>{kr(s.y2027.tax.trinnTax)}</td></tr>
            <tr><td>Trygdeavgift</td><td>{kr(s.y2026.tax.trygdeLonn + s.y2026.tax.trygdePensjon)}</td><td>{kr(s.y2027.tax.trygdeLonn + s.y2027.tax.trygdePensjon)}</td></tr>
            <tr><td>Fellesskatt lønn/pensjon</td><td>{kr(s.y2026.tax.fellesskatt)}</td><td>{kr(s.y2027.tax.fellesskatt)}</td></tr>
            <tr><td>− Skattefradrag pensjonist</td><td>{kr(s.y2026.tax.credit)}</td><td>{kr(s.y2027.tax.credit)}</td></tr>
            <tr className="subtotal"><td>Sum skatt lønn/pensjon</td><td>{kr(s.y2026.tax.totalTax)}</td><td>{kr(s.y2027.tax.totalTax)}</td></tr>
            <tr className="infoRow"><td>Renteinntekt opptjent i året (info)</td><td>{kr(s.y2026.renteAr)}</td><td>{kr(s.y2027.renteAr)}</td></tr>
            <tr className="infoRow"><td>↳ skatt derav, forfaller v/oppgjør</td><td>{kr(s.y2026.skattRenteInfoAr)}</td><td>{kr(s.y2027.skattRenteInfoAr)}</td></tr>
            <tr className="infoRow"><td>Gevinst tomt i året (info)</td><td>{kr(s.y2026.gevinstTomtAr)}</td><td>{kr(s.y2027.gevinstTomtAr)}</td></tr>
            <tr className="infoRow"><td>↳ skatt derav, forfaller v/oppgjør</td><td>{kr(s.y2026.skattGevinstInfoAr)}</td><td>{kr(s.y2027.skattGevinstInfoAr)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="ssection">
        <h4>Formuesskatt (per 31.12)</h4>
        <table className="ytable">
          <thead><tr><th></th><th>2026</th><th>2027</th></tr></thead>
          <tbody>
            <tr><td>Netto formuesgrunnlag</td><td>{krSigned(s.w2026.netto)}</td><td>{krSigned(s.w2027.netto)}</td></tr>
            <tr className="subtotal"><td>Formuesskatt</td><td>{kr(s.fs2026)}</td><td>{kr(s.fs2027)}</td></tr>
          </tbody>
        </table>
        <div className="tinytext">{s.w2026.detail} (2026) · {s.w2027.detail} (2027)</div>
      </div>
    </div>
  );
}

function App() {
  const [g, setG] = useState(DEFAULTS);
  const [saleA, setSaleA] = useState("2026-09-01");
  const [saleB, setSaleB] = useState("2027-01-01");
  const [saleC, setSaleC] = useState("2026-11-01");
  const [showC, setShowC] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);

  const set = (key) => (e) => {
    const v = e.target.type === "number" || e.target.type === "range" ? parseFloat(e.target.value) : e.target.value;
    setG((prev) => ({ ...prev, [key]: v }));
  };

  const lonnSluttA = useMemo(() => addMonths(new Date(saleA + "T00:00:00"), g.oppsigelsestidMndGenerisk), [saleA, g.oppsigelsestidMndGenerisk]);
  const lonnSluttB = useMemo(() => addMonths(new Date(g.oppsigelseStartDatoB + "T00:00:00"), g.oppsigelsestidMndB), [g.oppsigelseStartDatoB, g.oppsigelsestidMndB]);
  const lonnSluttC = useMemo(() => addMonths(new Date(saleC + "T00:00:00"), g.oppsigelsestidMndGenerisk), [saleC, g.oppsigelsestidMndGenerisk]);

  const resA = useMemo(() => computeScenario(saleA, g, lonnSluttA), [saleA, g, lonnSluttA]);
  const resB = useMemo(() => computeScenario(saleB, g, lonnSluttB), [saleB, g, lonnSluttB]);
  const resC = useMemo(() => computeScenario(saleC, g, lonnSluttC), [saleC, g, lonnSluttC]);

  const chartData = [
    { name: dfmt(resA.saleDate), verdi: Math.round(resA.sumAltDisponibelt) },
    { name: dfmt(resB.saleDate), verdi: Math.round(resB.sumAltDisponibelt) },
    ...(showC ? [{ name: dfmt(resC.saleDate), verdi: Math.round(resC.sumAltDisponibelt) }] : []),
  ];

  const diff = resB.sumAltDisponibelt - resA.sumAltDisponibelt;

  return (
    <div className="wrap">
      <style>{`
        :root{
          --ink:#1c2b3a; --ink2:#3d5064; --paper:#f6f4ee; --panel:#ffffff;
          --line:#dcd6c8; --accentA:#2f6f5e; --accentB:#a8562c; --accentC:#5a5290;
          --good:#2f6f5e; --bad:#a8362c;
        }
        *{box-sizing:border-box;}
        .wrap{font-family:'Iowan Old Style','Georgia',serif; background:var(--paper); color:var(--ink); padding:28px 20px 60px; max-width:1180px; margin:0 auto;}
        h1{font-family:'Iowan Old Style',Georgia,serif; font-size:28px; letter-spacing:-0.01em; margin:0 0 4px;}
        .lede{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:var(--ink2); font-size:14.5px; max-width:760px; line-height:1.5; margin-bottom:26px;}
        .panel{background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:20px 22px; margin-bottom:20px;}
        .panel h2{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:13px; text-transform:uppercase; letter-spacing:0.08em; color:var(--ink2); margin:0 0 16px; font-weight:600;}
        .grid{display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:16px 20px;}
        .field{display:flex; flex-direction:column; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
        .field-label{font-size:12.5px; color:var(--ink2); margin-bottom:5px; font-weight:600;}
        .field input, .field select{font-family:inherit; font-size:14px; padding:7px 9px; border:1px solid var(--line); border-radius:6px; background:#fdfcf9; color:var(--ink);}
        .field input[type=range]{padding:0;}
        .field-hint{font-size:11.5px; color:#8a8271; margin-top:4px;}
        .rangeval{font-size:12.5px; color:var(--ink); font-weight:600; margin-top:2px;}
        .scenario-picker{display:flex; gap:20px; flex-wrap:wrap; align-items:flex-end; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
        .datepick{display:flex; flex-direction:column; gap:5px;}
        .datepick label{font-size:12.5px; font-weight:700;}
        .datepick input{font-size:14px; padding:6px 8px; border:1px solid var(--line); border-radius:6px;}
        .toggle-c{font-size:13px; color:var(--ink2); cursor:pointer; user-select:none; align-self:center; margin-left:auto;}
        .cards{display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:18px; margin-top:20px;}
        .scard{background:var(--panel); border:1px solid var(--line); border-top:4px solid; border-radius:10px; padding:18px 18px 14px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
        .scard-head{display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;}
        .scard-head h3{margin:0; font-size:16px; font-family:'Iowan Old Style',Georgia,serif;}
        .scard-sub{font-size:11.5px; color:var(--ink2);}
        .srow{display:flex; justify-content:space-between; font-size:13px; padding:3px 0; gap:10px;}
        .srow.small{font-size:11.5px; color:#8a8271;}
        .srow-em{font-weight:700; border-top:1px solid var(--line); padding-top:5px; margin-top:2px;}
        .srow-total-mini{font-weight:700; font-size:13.5px; border-top:1px solid var(--line); padding-top:6px; margin-top:4px; color:var(--ink);}
        .tinytext-inline{font-size:11px; color:#8a8271; line-height:1.4; padding-bottom:4px;}
        .ytable tr.infoRow td{color:#a49c88; font-style:italic;}
        .srow-total{font-size:14.5px; padding:10px 0 14px; border-bottom:1px solid var(--line); margin-bottom:8px;}
        .ssection{margin-top:12px; padding-top:10px; border-top:1px dashed var(--line);}
        .ssection h4{margin:0 0 6px; font-size:11.5px; text-transform:uppercase; letter-spacing:0.06em; color:var(--ink2);}
        .ytable{width:100%; border-collapse:collapse; font-size:12.5px; margin-top:4px;}
        .ytable th{text-align:right; font-weight:600; color:var(--ink2); padding:3px 0; font-size:11px;}
        .ytable th:first-child{text-align:left;}
        .ytable td{text-align:right; padding:2.5px 0; border-bottom:1px solid #eee7d8;}
        .ytable td:first-child{text-align:left; color:var(--ink2);}
        .ytable tr.subtotal td{font-weight:700; color:var(--ink);}
        .tinytext{font-size:10.5px; color:#a49c88; margin-top:6px; line-height:1.4;}
        .diffbox{background:#eef2ea; border:1px solid #cfe0c8; border-radius:8px; padding:14px 18px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14px; margin:18px 0;}
        .diffbox b{font-size:17px;}
        details summary{cursor:pointer; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:13px; font-weight:600; color:var(--ink2); padding:4px 0;}
        .advgrid{margin-top:14px;}
        .footnote{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:11.5px; color:#8a8271; line-height:1.6; margin-top:28px; border-top:1px solid var(--line); padding-top:16px;}
        .chartbox{width:100%; height:220px; margin-top:6px;}
        .simplebars{display:flex; align-items:flex-end; justify-content:space-around; height:200px; gap:24px; padding-top:20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
        .simplebar-col{display:flex; flex-direction:column; align-items:center; flex:1; max-width:160px;}
        .simplebar-val{font-size:12px; font-weight:700; margin-bottom:6px; color:var(--ink);}
        .simplebar{width:56px; border-radius:5px 5px 0 0; transition:height 0.2s ease;}
        .simplebar-label{font-size:11.5px; color:var(--ink2); margin-top:8px; text-align:center;}
      `}</style>

      <h1>Salgsoppgjør-kalkulator</h1>
      <p className="lede">
        Sammenligner hva du sitter igjen med ved ulike salgstidspunkt for bolig og tomt, inkludert gevinstskatt på
        tomt, formuesskatt, pengeplassering fram til nytt boligkjøp, og skatt på lønn/pensjon/leieinntekt i
        overgangsårene. Alle tall er justerbare. Skattesatser er 2026-satser (vedtatt) brukt som beste anslag for 2027,
        siden neste års satser først fastsettes i statsbudsjettet i desember 2026.
      </p>

      <div className="panel">
        <h2>Salg av bolig og tomt</h2>
        <div className="grid">
          <Field label="Total salgssum (bolig + tomt)">
            <input type="number" step="10000" value={g.totalSalgssum} onChange={set("totalSalgssum")} />
          </Field>
          <Field label={`Fordeling — tomt: ${kr(g.tomtAndel)}`} hint={`Bolig: ${kr(g.totalSalgssum - g.tomtAndel)}`}>
            <input type="range" min="2000000" max="6000000" step="50000" value={g.tomtAndel} onChange={set("tomtAndel")} />
          </Field>
          <Field label="Kostpris bolig (1999)">
            <input type="number" step="10000" value={g.kostpris_bolig} onChange={set("kostpris_bolig")} />
          </Field>
          <Field label="Kostpris tomt (1999)">
            <input type="number" step="10000" value={g.kostpris_tomt} onChange={set("kostpris_tomt")} />
          </Field>
          <Field label="Gjeld som innfris ved salg">
            <input type="number" step="10000" value={g.gjeld} onChange={set("gjeld")} />
          </Field>
          <Field label="Gevinstskattsats tomt" hint="22% i 2026, brukt også for 2027">
            <input type="number" step="0.01" value={g.gevinstskattSats} onChange={set("gevinstskattSats")} />
          </Field>
          <Field label="Dager fra oppgjør til konto (megler)">
            <input type="number" step="1" value={g.bufferDager} onChange={set("bufferDager")} />
          </Field>
        </div>
      </div>

      <div className="panel">
        <h2>Ny bolig og pengeplassering</h2>
        <div className="grid">
          <Field label="Kjøpesum ny bolig">
            <input type="number" step="10000" value={g.nyBoligKjopesum} onChange={set("nyBoligKjopesum")} />
          </Field>
          <Field label="Dager fra penger på konto til boligkjøp">
            <input type="number" step="1" value={g.dagerTilNyBolig} onChange={set("dagerTilNyBolig")} />
          </Field>
          <Field label="Rente pengemarked (årlig)" hint="Standard 5%, kan endres">
            <input type="number" step="0.001" value={g.pengemarkedRente} onChange={set("pengemarkedRente")} />
          </Field>
          <Field label="Skattesats renteinntekt" hint="22% kapitalinntekt">
            <input type="number" step="0.01" value={g.renteSkattSats} onChange={set("renteSkattSats")} />
          </Field>
          <Field label="Skatteoppgjør — måned (1–12)" hint="Restskatt forfaller normalt høsten året etter salgsåret">
            <input type="number" min="1" max="12" step="1" value={g.skatteforfallManed} onChange={set("skatteforfallManed")} />
          </Field>
          <Field label="Skatteoppgjør — dag i måneden">
            <input type="number" min="1" max="28" step="1" value={g.skatteforfallDag} onChange={set("skatteforfallDag")} />
          </Field>
        </div>
      </div>

      <div className="panel">
        <h2>Inntekt i overgangsperioden</h2>
        <div className="grid">
          <Field label="Lønn brutto per måned">
            <input type="number" step="1000" value={g.lonnBruttoMnd} onChange={set("lonnBruttoMnd")} />
          </Field>
          <Field label="Oppsigelsestid (Scenario A / fritt scenario)" hint={`Lønnsslutt = salgsdato + antall måneder. A: ${dfmt(lonnSluttA)} · C: ${dfmt(lonnSluttC)}`}>
            <input type="number" min="0" max="12" step="1" value={g.oppsigelsestidMndGenerisk} onChange={set("oppsigelsestidMndGenerisk")} />
          </Field>
          <Field label="Scenario B — oppsigelse fra og med" hint="Jobber uansett ut januar 2027">
            <input type="date" value={g.oppsigelseStartDatoB} onChange={set("oppsigelseStartDatoB")} />
          </Field>
          <Field label="Scenario B — oppsigelsestid (mnd)" hint={`Inntil 3 mnd hvis arbeidsgiver krever. Lønnsslutt B: ${dfmt(lonnSluttB)}`}>
            <input type="number" min="0" max="3" step="1" value={g.oppsigelsestidMndB} onChange={set("oppsigelsestidMndB")} />
          </Field>
          <Field label="Bonus opptjent 2026 (mulig utbetaling 2027)">
            <input type="number" step="1000" value={g.bonusBelop} onChange={set("bonusBelop")} />
          </Field>
          <Field label="Bonus — utbetalingsdato" hint="Mottas kun hvis fortsatt ansatt/i oppsigelsestid ved denne datoen">
            <input type="date" value={g.bonusUtbetalingsDato} onChange={set("bonusUtbetalingsDato")} />
          </Field>
          <Field label="Pensjon brutto per måned">
            <input type="number" step="1000" value={g.pensjonBruttoMnd} onChange={set("pensjonBruttoMnd")} />
          </Field>
          <Field label="Pensjon fra og med">
            <input type="date" value={g.pensjonStartDato} onChange={set("pensjonStartDato")} />
          </Field>
          <Field label="Leieinntekt per måned" hint="Skattefri, løper til salgsdato">
            <input type="number" step="500" value={g.leieinntektMnd} onChange={set("leieinntektMnd")} />
          </Field>
        </div>
      </div>

      <details>
        <summary onClick={() => setAdvOpen(!advOpen)}>Avanserte skatteforutsetninger (trinnskatt, formuesskatt, minstefradrag — 2026-satser)</summary>
        {advOpen && (
          <div className="panel advgrid">
            <div className="grid">
              <Field label="Personfradrag"><input type="number" step="100" value={g.personfradrag} onChange={set("personfradrag")} /></Field>
              <Field label="Trygdeavgift lønn"><input type="number" step="0.001" value={g.trygdeLonn} onChange={set("trygdeLonn")} /></Field>
              <Field label="Trygdeavgift pensjon"><input type="number" step="0.001" value={g.trygdePensjon} onChange={set("trygdePensjon")} /></Field>
              <Field label="Minstefradrag lønn %"><input type="number" step="0.01" value={g.mfLonnSats} onChange={set("mfLonnSats")} /></Field>
              <Field label="Minstefradrag lønn tak"><input type="number" step="100" value={g.mfLonnTak} onChange={set("mfLonnTak")} /></Field>
              <Field label="Minstefradrag pensjon %"><input type="number" step="0.01" value={g.mfPensjonSats} onChange={set("mfPensjonSats")} /></Field>
              <Field label="Minstefradrag pensjon tak"><input type="number" step="100" value={g.mfPensjonTak} onChange={set("mfPensjonTak")} /></Field>
              <Field label="Formuesskatt bunnfradrag" hint="Enslig — dobbelt for ektepar"><input type="number" step="10000" value={g.formueBunnfradrag} onChange={set("formueBunnfradrag")} /></Field>
              <Field label="Formuesskatt innslag trinn 2"><input type="number" step="100000" value={g.formueTrinn2} onChange={set("formueTrinn2")} /></Field>
              <Field label="Formuesskattsats trinn 1"><input type="number" step="0.001" value={g.formueSats1} onChange={set("formueSats1")} /></Field>
              <Field label="Formuesskattsats trinn 2"><input type="number" step="0.001" value={g.formueSats2} onChange={set("formueSats2")} /></Field>
              <Field label="Primærbolig verdsettelse under 10 mill"><input type="number" step="0.01" value={g.primaerboligSatsUnder} onChange={set("primaerboligSatsUnder")} /></Field>
            </div>
          </div>
        )}
      </details>

      <div className="panel">
        <h2>Velg salgstidspunkt å sammenligne</h2>
        <div className="scenario-picker">
          <div className="datepick">
            <label style={{ color: "var(--accentA)" }}>Scenario A</label>
            <input type="date" value={saleA} onChange={(e) => setSaleA(e.target.value)} />
          </div>
          <div className="datepick">
            <label style={{ color: "var(--accentB)" }}>Scenario B</label>
            <input type="date" value={saleB} onChange={(e) => setSaleB(e.target.value)} />
          </div>
          {showC && (
            <div className="datepick">
              <label style={{ color: "var(--accentC)" }}>Scenario C (fri)</label>
              <input type="date" value={saleC} onChange={(e) => setSaleC(e.target.value)} />
            </div>
          )}
          <span className="toggle-c" onClick={() => setShowC(!showC)}>
            {showC ? "− skjul tredje scenario" : "+ legg til fritt scenario"}
          </span>
        </div>

        <div className="diffbox">
          Scenario B gir <b style={{ color: diff >= 0 ? "var(--good)" : "var(--bad)" }}>{krSigned(diff)}</b> {diff >= 0 ? "mer" : "mindre"} netto disponibelt enn Scenario A, ved utgangen av 2027, med gjeldende forutsetninger.
        </div>

        <div className="chartbox">
          {(() => {
            const maxVal = Math.max(...chartData.map((d) => d.verdi), 1);
            const colors = ["#2f6f5e", "#a8562c", "#5a5290"];
            return (
              <div className="simplebars">
                {chartData.map((d, i) => (
                  <div className="simplebar-col" key={d.name}>
                    <div className="simplebar-val">{(d.verdi / 1e6).toFixed(2)}M</div>
                    <div
                      className="simplebar"
                      style={{
                        height: `${Math.max(4, (d.verdi / maxVal) * 160)}px`,
                        background: colors[i],
                      }}
                    />
                    <div className="simplebar-label">{d.name}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      <div className="cards">
        <ScenarioCard title="Scenario A" subtitle={dfmt(resA.saleDate)} s={resA} accent="#2f6f5e" />
        <ScenarioCard title="Scenario B" subtitle={dfmt(resB.saleDate)} s={resB} accent="#a8562c" />
        {showC && <ScenarioCard title="Scenario C" subtitle={dfmt(resC.saleDate)} s={resC} accent="#5a5290" />}
      </div>

      <div className="footnote">
        <b>Forutsetninger og forbehold:</b> Beregningen antar boligsalget er skattefritt (egen bruk oppfylt) og at
        gevinst på tomt beskattes samlet med øvrig alminnelig inntekt à 22 %. Formuesskatt er beregnet som enslig
        skattyter (bunnfradrag {kr(DEFAULTS.formueBunnfradrag)}; dobbelt ved felles ligning for ektefeller — endre i
        avanserte forutsetninger om aktuelt). Boligers markedsverdi for formuesskatt er antatt lik salgs-/kjøpesum;
        faktisk formuesgrunnlag fra Skatteetatens boligmodell kan avvike noe. Renteinntekt på pengemarkedsplassering
        beregnes som enkel rente (ikke rentes rente), fordelt forholdsmessig mellom 2026 og 2027 etter antall dager.
        Trinnskatt, trygdeavgift, minstefradrag og formuesskattesatser for 2027 er ukjente og satt lik vedtatte
        2026-satser som beste anslag — oppdater i "Avanserte skatteforutsetninger" når 2027-budsjettet er kjent
        (normalt medio oktober 2026, vedtatt i desember). Skattebegrensningsregelen for lav inntekt/pensjon og
        eventuell formuesskatteutsettelse er ikke modellert. <b>Lønnsslutt beregnes ulikt per scenario:</b> Scenario A
        og det frie scenarioet bruker salgsdato + oppsigelsestid (standard 3 måneder), mens Scenario B bruker en fast
        dato (standard 1. februar 2027) pluss en egen oppsigelsestid (0–3 måneder) for å reflektere at arbeidsgiver
        kan kreve inntil 3 måneders oppsigelse. Bonus opptjent i 2026 anses skattemessig som lønn utbetalt det året
        den faktisk betales (kontantprinsippet), og regnes bare med dersom siste lønnsdag i scenarioet er på eller
        etter bonusens utbetalingsdato — ellers bortfaller den i beregningen. <b>Skatt på tomtegevinst og på
        renteinntekt fra pengemarkedsplasseringen trekkes IKKE ved oppgjøret</b> — de er modellert som restskatt som
        forfaller ved skatteoppgjøret (standard: 1. september) året etter salgsåret, slik at hele beløpet ligger og
        genererer renter fram til forfall, jf. "Pengemarked → ny bolig → skatteoppgjør". I virkeligheten kan
        skatteoppgjøret komme når som helst fra juni til oktober avhengig av når selvangivelsen behandles, og
        renteinntekt opptjent etter årsskiftet vil strengt tatt først forfalle ved <i>neste</i> skatteoppgjør igjen —
        her er alt forenklet til ett samlet oppgjørspunkt slik du ba om. Formuesskatt-beregningen for årsskiftene
        2026/2027 tar hensyn til denne skyldige, ikke-forfalte skatten som fradrag i formuen. Dette er et
        støtteverktøy for egne overslag, ikke skatterådgivning.
      </div>
    </div>
  );
}


const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
