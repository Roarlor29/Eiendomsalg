import {useMemo,useState} from 'react'
import {buildCapitalTimeline,tax2027,primaryResidenceTaxValue,wealthTax2027} from './engineV2.js'
const kr=n=>(Math.round(n)||0).toLocaleString('nb-NO')+' kr';const pct=n=>(n*100).toFixed(1).replace('.',',')+' %';const d=n=>n.toLocaleDateString('nb-NO',{day:'2-digit',month:'short',year:'numeric'});const add=(x,n)=>{const r=new Date(x);r.setDate(r.getDate()+n);return r};const days=(a,b)=>Math.max(0,(b-a)/86400000);
const D={sale:'2027-01-15',saleCost:0,total:23000000,land:0,landCost:2000000,landImprovements:0,debt:10500000,home:7500000,buffer:14,homeDelay:90,rate:.05,salary:75000,salaryMonths:1,pension:31000,pensionStart:'2027-01-01',rent:18500,rentTaxable:false,landTaxable:true,residenceGainTaxFree:true,purchaseTotal:0,acquisitionCosts:0,propertyImprovements:0,otherAssets:0,otherDebt:0,jointTaxation:false,taxPaymentMonth:8,taxAuthorityRate:.0312,
  // Inntektsskatt 2027/2028 — kan overstyres i "Avanserte forutsetninger" når nye satser er kjent
  personfradrag:114540,trygdeLonn:.076,trygdePensjon:.051,mfLonnSats:.46,mfLonnTak:95700,mfPensjonSats:.40,mfPensjonTak:75400,fellesskattSats:.22,
  pensionCreditMax:37100,pensionStep1:284950,pensionStep2:436050,pensionRate1:.167,pensionRate2:.06,
  trinn1Fra:226100,trinn1Sats:.017,trinn2Fra:318300,trinn2Sats:.04,trinn3Fra:725050,trinn3Sats:.137,trinn4Fra:980100,trinn4Sats:.168,trinn5Fra:1467200,trinn5Sats:.178,
  // Formuesskatt 2027/2028 — bunnfradrag/trinn-bredde er for enslig, dobles automatisk ved felles ligning
  formueBunnfradrag:1900000,formueTrinn2Bredde:19600000,formueSats1:.01,formueSats2:.011,
  primaerboligTak:14000000,primaerboligSatsUnder:.25,primaerboligSatsOver:.70,
};
function scenario(g){
  const saleDate=new Date(g.sale+'T00:00:00'),konto=add(saleDate,g.buffer),homeDate=add(konto,g.homeDelay),taxYearEnd=new Date(2028,0,1),initial=g.total-g.debt-g.saleCost;
  const taxableLand=Math.max(0,Math.min(g.land,g.total)),taxableLandShare=g.total>0?taxableLand/g.total:0,allocatedSaleCost=g.saleCost*taxableLandShare;
  const landGain=g.landTaxable?Math.max(0,g.land-allocatedSaleCost-g.landCost-g.landImprovements):0;
  const taxableResidenceGain=g.residenceGainTaxFree?0:Math.max(0,g.total-g.land-g.purchaseTotal-g.acquisitionCosts-g.propertyImprovements-g.saleCost+allocatedSaleCost);
  const cap=buildCapitalTimeline({settlementDate:konto,homePurchaseDate:homeDate,taxYearEnd,initialCash:initial,homePurchasePrice:g.home,annualRate:g.rate,interestTaxRate:g.fellesskattSats,landGainTax:0,residenceGainTax:0});
  const salary=g.salary*Math.max(1,Math.min(12,Number(g.salaryMonths)||12));
  const pension=g.pension*12;
  const rent=g.rent*12*Math.max(0,days(saleDate,taxYearEnd))/365;
  const taxableRental=g.rentTaxable?rent:0;
  const taxablePropertyGain=landGain+taxableResidenceGain;
  const trinn=[{fra:g.trinn1Fra,sats:g.trinn1Sats},{fra:g.trinn2Fra,sats:g.trinn2Sats},{fra:g.trinn3Fra,sats:g.trinn3Sats},{fra:g.trinn4Fra,sats:g.trinn4Sats},{fra:g.trinn5Fra,sats:g.trinn5Sats}];
  const taxParams={personfradrag:g.personfradrag,trinn,trygdeLonn:g.trygdeLonn,trygdePensjon:g.trygdePensjon,mfLonnSats:g.mfLonnSats,mfLonnTak:g.mfLonnTak,mfPensjonSats:g.mfPensjonSats,mfPensjonTak:g.mfPensjonTak,fellesskattSats:g.fellesskattSats,pensionCreditMax:g.pensionCreditMax,pensionStep1:g.pensionStep1,pensionStep2:g.pensionStep2,pensionRate1:g.pensionRate1,pensionRate2:g.pensionRate2};
  const wealthParams={bunnfradragSingle:g.formueBunnfradrag,trinn2BreddeSingle:g.formueTrinn2Bredde,sats1:g.formueSats1,sats2:g.formueSats2};
  const homeParams={tak:g.primaerboligTak,satsUnder:g.primaerboligSatsUnder,satsOver:g.primaerboligSatsOver};
  const tax=tax2027({salary,pension,interestIncome:cap.totalInterest2027,taxableRental,taxablePropertyGain,...taxParams});
  const estimatedWithholding=tax2027({salary,pension,interestIncome:0,taxableRental:0,taxablePropertyGain:0,...taxParams}).total;
  const cashAfterWithholding=cap.cashBeforeTax-estimatedWithholding;
  const fs=(()=>{const yearEndCash=cashAfterWithholding;const homeValue=primaryResidenceTaxValue(g.home,homeParams);const net=Math.max(0,homeValue+yearEndCash+g.otherAssets-g.otherDebt);return {primary:homeValue,cash:yearEndCash,other:g.otherAssets,debt:g.otherDebt,net}})();
  const wealthTax=wealthTax2027(fs.net,g.jointTaxation,wealthParams);
  const estimatedTaxSettlement=tax.total+wealthTax;
  const taxSettlement2028=Math.max(0,estimatedTaxSettlement-estimatedWithholding);
  const taxToRefund2028=Math.max(0,estimatedWithholding-estimatedTaxSettlement);
  const taxPaymentDate=new Date(2028,Math.max(0,Math.min(11,Number(g.taxPaymentMonth)-1)),20);
  const deferredTaxInterest=taxSettlement2028*g.rate*days(new Date(2028,0,1),taxPaymentDate)/365;
  const taxAuthorityInterest=taxSettlement2028*g.taxAuthorityRate*days(new Date(2027,6,1),taxPaymentDate)/365;
  const netAfterTax=cap.cashBeforeTax-estimatedTaxSettlement;
  const netAfterTaxSettlement=netAfterTax+deferredTaxInterest-taxAuthorityInterest;
  const ordinaryIncomeBase=salary+pension+cap.totalInterest2027+taxableRental+taxablePropertyGain;
  const ordinaryIncomeAfterDeductions=tax.ordinaryIncome;
  const propertyOrdinaryTax=taxablePropertyGain*g.fellesskattSats;
  const otherOrdinaryTax=tax.common-propertyOrdinaryTax;
  return {saleDate,konto,homeDate,initial,cap,landGain,taxableResidenceGain,taxablePropertyGain,salary,pension,rent,taxableRental,tax,estimatedWithholding,cashAfterWithholding,fs,wealthTax,estimatedTaxSettlement,taxSettlement2028,taxToRefund2028,taxPaymentDate,deferredTaxInterest,taxAuthorityInterest,netAfterTax,netAfterTaxSettlement,allocatedSaleCost,ordinaryIncomeBase,ordinaryIncomeAfterDeductions,propertyOrdinaryTax,otherOrdinaryTax};
}
function Card({s,g}){return <div className="scard" style={{borderTop:'4px solid #2f6f5e'}}><h3>Salg · {d(s.saleDate)}</h3><div className="srow srow-total"><span>Netto kapital etter skatteoppgjør 2028</span><b>{kr(s.netAfterTaxSettlement)}</b></div><div className="ssection"><h4>Salg og oppgjør</h4><div className="srow"><span>Salgssum</span><span>{kr(g.total)}</span></div><div className="srow"><span>Gjeld innfridd ved salg</span><span>{kr(g.debt)}</span></div><div className="srow"><span>Salgsomkostninger</span><span>{kr(g.saleCost)}</span></div><div className="srow"><span>Netto kjøpesum etter gjeld/salgskostnader</span><b>{kr(s.initial)}</b></div><div className="srow"><span>Oppgjør mottatt</span><span>{d(s.konto)}</span></div></div><div className="ssection"><h4>Skatt på inntektsåret 2027</h4><div className="srow"><span>Lønn ({g.salaryMonths} {Number(g.salaryMonths)===1?'måned':'måneder'})</span><span>{kr(s.salary)}</span></div><div className="srow"><span>Pensjon (12 måneder)</span><span>{kr(s.pension)}</span></div><div className="srow"><span>Renteinntekt 2027</span><span>{kr(s.cap.totalInterest2027)}</span></div><div className="srow"><span>Skattepliktig leie</span><span>{kr(s.taxableRental)}</span></div><div className="srow"><span>Skattepliktig eiendomsgevinst</span><span>{kr(s.taxablePropertyGain)}</span></div><details className="tax-detail" open><summary>Vis beregningen av alminnelig inntektsskatt</summary><div className="tax-visual"><div className="tax-title">Fra inntekt til alminnelig inntekt</div><div className="tax-line"><span>Lønn</span><b>{kr(s.salary)}</b></div><div className="tax-line"><span>Pensjon</span><b>{kr(s.pension)}</b></div><div className="tax-line"><span>Renteinntekt</span><b>{kr(s.cap.totalInterest2027)}</b></div><div className="tax-line"><span>Skattepliktig leie</span><b>{kr(s.taxableRental)}</b></div><div className="tax-line"><span>Skattepliktig eiendomsgevinst</span><b>{kr(s.taxablePropertyGain)}</b></div><div className="tax-line total"><span>Sum inntekter</span><b>{kr(s.ordinaryIncomeBase)}</b></div><div className="tax-line deduction"><span>− minstefradrag</span><b>{kr(s.tax.minimumDeduction)}</b></div><div className="tax-line deduction"><span>− personfradrag</span><b>{kr(g.personfradrag)}</b></div><div className="tax-line total"><span>= Alminnelig inntekt</span><b>{kr(s.ordinaryIncomeAfterDeductions)}</b></div><div className="tax-equation">{kr(s.ordinaryIncomeAfterDeductions)} × {pct(g.fellesskattSats)} = <b>{kr(s.tax.common)}</b></div><div className="tax-bars"><div className="tax-bar"><span style={{width:`${Math.min(100,Math.max(0,s.propertyOrdinaryTax/s.tax.common*100))}%`}}></span></div><div className="tax-bar-legend"><span>Tomte-/boliggevinstbidrag: {kr(s.propertyOrdinaryTax)}</span><span>Øvrig bidrag: {kr(s.otherOrdinaryTax)}</span></div></div><p className="field-hint">{pct(g.fellesskattSats)} beregnes av alminnelig inntekt. Fordelingen under er en analytisk visning: eiendomsgevinsten alene bidrar med {pct(g.fellesskattSats)} av den skattepliktige gevinsten, mens resten av skatt på alminnelig inntekt kommer fra øvrige inntekter etter fradrag. Fradragene er ikke særskilt fordelt på inntektskildene.</p></div></details><div className="srow"><span>Skatt på alminnelig inntekt</span><span>{kr(s.tax.common)}</span></div><div className="srow"><span>Trinnskatt</span><span>{kr(s.tax.bracket)}</span></div><div className="srow"><span>Trygdeavgift</span><span>{kr(s.tax.socialSalary+s.tax.socialPension)}</span></div><div className="srow"><span>Pensjonistfradrag</span><span>{kr(s.tax.pensionCredit)}</span></div><div className="srow"><span>Samlet inntektsskatt 2027</span><b>{kr(s.tax.total)}</b></div></div><div className="ssection"><h4>Eiendomsgevinst</h4><div className="srow"><span>Skattepliktig tomtegevinst / {pct(g.fellesskattSats)} beregnet skatt</span><span>{kr(s.landGain)} / {kr(s.landGain*g.fellesskattSats)}</span></div><div className="srow"><span>Skattepliktig boliggevinst / {pct(g.fellesskattSats)} beregnet skatt</span><span>{kr(s.taxableResidenceGain)} / {kr(s.taxableResidenceGain*g.fellesskattSats)}</span></div><div className="srow"><span>Salgsomkostning allokert til tomtedel</span><span>{kr(s.allocatedSaleCost)}</span></div></div><div className="ssection"><h4>Formue 31.12.2027</h4><div className="srow"><span>Primærbolig – skattemessig verdi</span><span>{kr(s.fs.primary)}</span></div><div className="srow"><span>Kontanter/kapital etter beregnet forskuddstrekk</span><span>{kr(s.fs.cash)}</span></div><div className="srow"><span>Andre eiendeler</span><span>{kr(s.fs.other)}</span></div><div className="srow"><span>Gjeld</span><span>{kr(s.fs.debt)}</span></div><div className="srow"><span>Netto formue</span><b>{kr(s.fs.net)}</b></div><div className="srow"><span>Formuesskatt 2027</span><b>{kr(s.wealthTax)}</b></div></div><div className="ssection"><h4>Skatteoppgjør 2028</h4><div className="srow"><span>Beregnet samlet skatt 2027</span><span>{kr(s.estimatedTaxSettlement)}</span></div><div className="srow"><span>Anslått forskuddsbetalt skatt – lønn/pensjon</span><span>{kr(s.estimatedWithholding)}</span></div><div className="srow"><span>Restskatt til oppgjør i 2028</span><b>{kr(s.taxSettlement2028)}</b></div><div className="srow"><span>Eventuell skatt til gode</span><span>{kr(s.taxToRefund2028)}</span></div><div className="srow"><span>Forventet betaling av restskatt</span><span>{d(s.taxPaymentDate)}</span></div><div className="srow"><span>Rente du kan tjene på utsatt restskatt</span><span>{kr(s.deferredTaxInterest)}</span></div><div className="srow"><span>Foreløpig anslag rentetillegg Skatteetaten</span><span>{kr(s.taxAuthorityInterest)}</span></div><div className="srow srow-total"><span>Netto kapital etter skatteoppgjør 2028</span><b>{kr(s.netAfterTaxSettlement)}</b></div><p className="field-hint">Renten du kan tjene beregnes på restskatten fra 01.01.2028 til valgt betalingsmåned, med din oppgitte pengemarkedsrente. Rentetillegget fra Skatteetaten er separat og bruker sist publiserte sats som foreløpig beregningsgrunnlag; 2027-satsen er ikke publisert ennå.</p></div></div>}
const STORAGE_KEY='eiendomsalg-v2-inputs-v3';
const LEGACY_STORAGE_KEYS=['eiendomsalg-v2-inputs','eiendomsalg-v2-inputs-v2'];
const SAVED_TO_STATE={
  'Salgstidspunkt':'sale',
  'Salgssum':'total',
  'Skattepliktig tomteandel':'land',
  'Tomtekostpris':'landCost',
  'Påkostninger tomt':'landImprovements',
  'Salgsomkostninger':'saleCost',
  'Gjeld før salg':'debt',
  'Ny bolig':'home',
  'Opprinnelig eiendomsverdi':'purchaseTotal',
  'Kjøpskostnader':'acquisitionCosts',
  'Påkostninger bolig':'propertyImprovements',
  'Andre eiendeler':'otherAssets',
  'Annen gjeld':'otherDebt',
  'Lønn/mnd i 2027':'salary',
  'Antall arbeidsmåneder 2027':'salaryMonths',
  'Pensjon/mnd i 2027':'pension',
  'Leie/mnd i 2027':'rent',
  'Pengemarkedsrente':'rate',
  'Forventet betalingsmåned restskatt 2028':'taxPaymentMonth',
};
const BOOLEAN_KEYS=new Set(['Boliggevinst er skattefri etter eier-/brukstidsreglene','Tomteandelen over naturlig arrondert tomt er skattepliktig','Leieinntekten er skattepliktig','Gift/registrert partner/meldepliktig samboer – skattlegges samlet']);
const NUMERIC_KEYS=new Set(['total','land','landCost','landImprovements','saleCost','debt','home','purchaseTotal','acquisitionCosts','propertyImprovements','otherAssets','otherDebt','salary','salaryMonths','pension','rent','rate','taxPaymentMonth']);
function loadSavedState(){
  try{
    LEGACY_STORAGE_KEYS.forEach(key=>localStorage.removeItem(key));
    const data=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(!data) return {};
    const saved={};
    Object.entries(SAVED_TO_STATE).forEach(([label,key])=>{
      if(!(label in data)) return;
      const value=data[label];
      saved[key]=BOOLEAN_KEYS.has(label)?Boolean(value):NUMERIC_KEYS.has(key)?Number(value):value;
    });
    return saved;
  }catch{return {}}
}

function MoneyInput({value,onChange}){const[focused,setFocused]=useState(false);const raw=String(value??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');const display=focused?raw:(raw?Number(raw).toLocaleString('nb-NO'):'');return <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" data-money="1" value={display} onFocus={e=>{setFocused(true);setTimeout(()=>{if(raw==='0')e.target.select()},0)}} onClick={e=>{if(raw==='0')e.target.select()}} onChange={e=>{const next=e.target.value.replace(/\D/g,'').replace(/^0+(?=\d)/,'');onChange({target:{type:'number',value:next}})}} onBlur={()=>setFocused(false)}/>}
// Grenser for felt som ikke går via MoneyInput (som allerede fjerner ugyldige tegn).
const RATE={min:0,max:2};
const CLAMP={
  rate:RATE,
  trygdeLonn:RATE,trygdePensjon:RATE,mfLonnSats:RATE,mfPensjonSats:RATE,fellesskattSats:RATE,
  pensionRate1:RATE,pensionRate2:RATE,formueSats1:RATE,formueSats2:RATE,
  primaerboligSatsUnder:RATE,primaerboligSatsOver:RATE,
  trinn1Sats:RATE,trinn2Sats:RATE,trinn3Sats:RATE,trinn4Sats:RATE,trinn5Sats:RATE,
};
const SALE_MIN='2027-01-01',SALE_MAX='2027-12-31';
export default function PreciseApp(){const[g,setG]=useState(()=>({...D,...loadSavedState()}));const S=useMemo(()=>scenario(g),[g]);const set=k=>e=>{if(e.target.type==='number'){const v=+e.target.value;if(!isFinite(v))return;const c=CLAMP[k];setG(x=>({...x,[k]:c?Math.min(c.max,Math.max(c.min,v)):v}));return}if(k==='sale'){const v=e.target.value;const clamped=v<SALE_MIN?SALE_MIN:v>SALE_MAX?SALE_MAX:v;setG(x=>({...x,sale:clamped}));return}setG(x=>({...x,[k]:e.target.value}))};const toggle=k=>setG(x=>({...x,[k]:!x[k]}));return <div className="wrap"><h1>Eiendomsalg V2 · personlig økonomi 2027</h1><p className="lede">Modellen er bygget rundt salg og oppgjør i januar 2027. 2027 er inntektsåret for salget og den løpende personlige økonomien. Skatteoppgjøret for 2027 kommer i 2028. 2026 er ikke med i beregningen.</p><div className="panel"><h2>Hovedresultat</h2><div className="hero-grid"><div className="hero"><span>Netto kapital etter skatteoppgjør 2028</span><strong>{kr(S.netAfterTaxSettlement)}</strong><small>{d(S.saleDate)} salg · oppgjør {d(S.konto)} · beregnes automatisk</small></div></div></div><div className="panel"><h2>2027-forutsetninger</h2><div className="grid"><Field label="Salgstidspunkt"><input type="date" value={g.sale} min="2027-01-01" max="2027-12-31" onChange={set('sale')}/></Field><Field label="Salgssum"><MoneyInput value={g.total} onChange={set('total')}/></Field><Field label="Skattepliktig tomteandel"><MoneyInput value={g.land} onChange={set('land')}/></Field><Field label="Tomtekostpris"><MoneyInput value={g.landCost} onChange={set('landCost')}/></Field><Field label="Påkostninger tomt"><MoneyInput value={g.landImprovements} onChange={set('landImprovements')}/></Field><Field label="Salgsomkostninger"><MoneyInput value={g.saleCost} onChange={set('saleCost')}/></Field><Field label="Gjeld før salg"><MoneyInput value={g.debt} onChange={set('debt')}/></Field><Field label="Ny bolig"><MoneyInput value={g.home} onChange={set('home')}/></Field><Field label="Opprinnelig eiendomsverdi"><MoneyInput value={g.purchaseTotal} onChange={set('purchaseTotal')}/></Field><Field label="Kjøpskostnader"><MoneyInput value={g.acquisitionCosts} onChange={set('acquisitionCosts')}/></Field><Field label="Påkostninger bolig"><MoneyInput value={g.propertyImprovements} onChange={set('propertyImprovements')}/></Field><Field label="Andre eiendeler"><MoneyInput value={g.otherAssets} onChange={set('otherAssets')}/></Field><Field label="Annen gjeld"><MoneyInput value={g.otherDebt} onChange={set('otherDebt')}/></Field><Field label="Lønn/mnd i 2027"><MoneyInput value={g.salary} onChange={set('salary')}/></Field><Field label="Antall arbeidsmåneder 2027"><select value={g.salaryMonths} onChange={set('salaryMonths')}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1} {i===0?'måned':'måneder'}</option>)}</select></Field><Field label="Pensjon/mnd i 2027"><MoneyInput value={g.pension} onChange={set('pension')}/></Field><Field label="Leie/mnd i 2027"><MoneyInput value={g.rent} onChange={set('rent')}/></Field><Field label="Pengemarkedsrente"><input type="number" step=".001" min="0" max="2" value={g.rate} onChange={set('rate')}/></Field><Field label="Forventet betalingsmåned restskatt 2028"><select value={g.taxPaymentMonth} onChange={set('taxPaymentMonth')}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'][i]}</option>)}</select></Field></div><div className="checks"><label><input type="checkbox" checked={g.residenceGainTaxFree} onChange={()=>toggle('residenceGainTaxFree')}/> Boliggevinst er skattefri etter eier-/brukstidsreglene</label><label><input type="checkbox" checked={g.landTaxable} onChange={()=>toggle('landTaxable')}/> Tomteandelen over naturlig arrondert tomt er skattepliktig</label><label><input type="checkbox" checked={g.rentTaxable} onChange={()=>toggle('rentTaxable')}/> Leieinntekten er skattepliktig</label><label><input type="checkbox" checked={g.jointTaxation} onChange={()=>toggle('jointTaxation')}/> Gift/registrert partner/meldepliktig samboer – skattlegges samlet</label></div><p className="field-hint">Endringer rekalkuleres umiddelbart. Pensjon er satt til 12 måneder; lønn beregnes som månedslønn × valgt antall arbeidsmåneder. Skatten for 2027 beregnes ut fra inntekter i 2027 og formue ved utgangen av 2027. Skatteoppgjøret for 2027 kommer i 2028. 2027-satsene er foreløpig ikke publisert, så modellen bruker sist publiserte satser som foreløpig beregningsgrunnlag.</p></div>
<details className="panel">
  <summary>Avanserte forutsetninger — inntektsskatt (2027/2028)</summary>
  <p className="field-hint">Oppdater her når nye satser for 2027 eller 2028 blir kjent. Alt annet i modellen regnes automatisk på nytt.</p>
  <div className="grid">
    <Field label="Personfradrag"><MoneyInput value={g.personfradrag} onChange={set('personfradrag')}/></Field>
    <Field label="Trygdeavgift lønn"><input type="number" step=".001" min="0" max="2" value={g.trygdeLonn} onChange={set('trygdeLonn')}/></Field>
    <Field label="Trygdeavgift pensjon"><input type="number" step=".001" min="0" max="2" value={g.trygdePensjon} onChange={set('trygdePensjon')}/></Field>
    <Field label="Minstefradrag lønn %"><input type="number" step=".01" min="0" max="2" value={g.mfLonnSats} onChange={set('mfLonnSats')}/></Field>
    <Field label="Minstefradrag lønn tak"><MoneyInput value={g.mfLonnTak} onChange={set('mfLonnTak')}/></Field>
    <Field label="Minstefradrag pensjon %"><input type="number" step=".01" min="0" max="2" value={g.mfPensjonSats} onChange={set('mfPensjonSats')}/></Field>
    <Field label="Minstefradrag pensjon tak"><MoneyInput value={g.mfPensjonTak} onChange={set('mfPensjonTak')}/></Field>
    <Field label="Fellesskattsats"><input type="number" step=".01" min="0" max="2" value={g.fellesskattSats} onChange={set('fellesskattSats')}/></Field>
    <Field label="Skattefradrag pensjonist — maks"><MoneyInput value={g.pensionCreditMax} onChange={set('pensionCreditMax')}/></Field>
    <Field label="Pensjonist — utfasing starter"><MoneyInput value={g.pensionStep1} onChange={set('pensionStep1')}/></Field>
    <Field label="Pensjonist — utfasing trinn 2"><MoneyInput value={g.pensionStep2} onChange={set('pensionStep2')}/></Field>
    <Field label="Pensjonist — utfasingssats trinn 1"><input type="number" step=".001" min="0" max="2" value={g.pensionRate1} onChange={set('pensionRate1')}/></Field>
    <Field label="Pensjonist — utfasingssats trinn 2"><input type="number" step=".001" min="0" max="2" value={g.pensionRate2} onChange={set('pensionRate2')}/></Field>
  </div>
  <p className="field-hint">Trinnskatt — innslagspunkt (fra) og sats per trinn:</p>
  <div className="grid">
    <Field label="Trinn 1 — fra"><MoneyInput value={g.trinn1Fra} onChange={set('trinn1Fra')}/></Field>
    <Field label="Trinn 1 — sats"><input type="number" step=".001" min="0" max="2" value={g.trinn1Sats} onChange={set('trinn1Sats')}/></Field>
    <Field label="Trinn 2 — fra"><MoneyInput value={g.trinn2Fra} onChange={set('trinn2Fra')}/></Field>
    <Field label="Trinn 2 — sats"><input type="number" step=".001" min="0" max="2" value={g.trinn2Sats} onChange={set('trinn2Sats')}/></Field>
    <Field label="Trinn 3 — fra"><MoneyInput value={g.trinn3Fra} onChange={set('trinn3Fra')}/></Field>
    <Field label="Trinn 3 — sats"><input type="number" step=".001" min="0" max="2" value={g.trinn3Sats} onChange={set('trinn3Sats')}/></Field>
    <Field label="Trinn 4 — fra"><MoneyInput value={g.trinn4Fra} onChange={set('trinn4Fra')}/></Field>
    <Field label="Trinn 4 — sats"><input type="number" step=".001" min="0" max="2" value={g.trinn4Sats} onChange={set('trinn4Sats')}/></Field>
    <Field label="Trinn 5 — fra"><MoneyInput value={g.trinn5Fra} onChange={set('trinn5Fra')}/></Field>
    <Field label="Trinn 5 — sats"><input type="number" step=".001" min="0" max="2" value={g.trinn5Sats} onChange={set('trinn5Sats')}/></Field>
  </div>
</details>
<details className="panel">
  <summary>Avanserte forutsetninger — formuesskatt (2027/2028)</summary>
  <p className="field-hint">Bunnfradrag og trinn-bredde er for enslig — dobles automatisk når "skattlegges samlet" er krysset av over.</p>
  <div className="grid">
    <Field label="Formuesskatt — bunnfradrag (enslig)"><MoneyInput value={g.formueBunnfradrag} onChange={set('formueBunnfradrag')}/></Field>
    <Field label="Formuesskatt — bredde trinn 1 (enslig)"><MoneyInput value={g.formueTrinn2Bredde} onChange={set('formueTrinn2Bredde')}/></Field>
    <Field label="Formuesskattsats trinn 1"><input type="number" step=".001" min="0" max="2" value={g.formueSats1} onChange={set('formueSats1')}/></Field>
    <Field label="Formuesskattsats trinn 2"><input type="number" step=".001" min="0" max="2" value={g.formueSats2} onChange={set('formueSats2')}/></Field>
    <Field label="Primærbolig — verdsettelsestak"><MoneyInput value={g.primaerboligTak} onChange={set('primaerboligTak')}/></Field>
    <Field label="Primærbolig — sats under tak"><input type="number" step=".01" min="0" max="2" value={g.primaerboligSatsUnder} onChange={set('primaerboligSatsUnder')}/></Field>
    <Field label="Primærbolig — sats over tak"><input type="number" step=".01" min="0" max="2" value={g.primaerboligSatsOver} onChange={set('primaerboligSatsOver')}/></Field>
  </div>
</details>
<Card s={S} g={g}/><div className="footnote"><b>Avgrensning:</b> 2026 er tatt helt ut av aktiv modell. Salget kan kun legges i 2027. Modellen skiller mellom kontantoppgjør i januar, løpende renteinntekter i 2027, samlet inntektsskatt for 2027, forskuddstrekk gjennom 2027, formue 31.12.2027 og skatteoppgjør i 2028. Forskuddstrekket er et modellert anslag basert på beregnet skatt på lønn og pensjon alene; faktisk trekk følger skattekortet. Rente på utsatt restskatt og eventuelt rentetillegg fra Skatteetaten er vist separat.</div></div>}
function Field({label,children}){return <label className="field"><span className="field-label">{label}</span>{children}</label>}
