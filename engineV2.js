// V2 tax and capital engine. 2027 is the active tax year for the property sale model.
export function buildCapitalTimeline({settlementDate,homePurchaseDate,taxYearEnd,initialCash,homePurchasePrice,annualRate,interestTaxRate,landGainTax=0,residenceGainTax=0}){
  const day=86400000;
  const days=(a,b)=>Math.max(0,(b-a)/day);
  const interest=(p,a,b)=>p*annualRate*days(a,b)/365;
  const end=taxYearEnd;
  const interestToPurchase=interest(initialCash,settlementDate,homePurchaseDate);
  const cashAfterPurchase=initialCash+interestToPurchase-homePurchasePrice;
  const interestAfterPurchase=interest(cashAfterPurchase,homePurchaseDate,end);
  const totalInterest2027=interestToPurchase+interestAfterPurchase;
  const capitalTax2027=totalInterest2027*interestTaxRate+landGainTax+residenceGainTax;
  const cashBeforeTax=cashAfterPurchase+interestAfterPurchase;
  return {settlementDate,homePurchaseDate,taxYearEnd:end,initialCash,homePurchasePrice,interestToPurchase,interestAfterPurchase,totalInterest2027,interestTax2027:totalInterest2027*interestTaxRate,landGainTax,residenceGainTax,capitalTax2027,cashBeforeTax,cashAfterTax2027:cashBeforeTax-capitalTax2027};
}

export function allocateInterestToTaxYears({settlementDate,homePurchaseDate,taxYearEnd,initialCash,homePurchasePrice,annualRate}){
  const day=86400000;
  const days=(a,b)=>Math.max(0,(b-a)/day);
  const overlap=(a,b,s,e)=>Math.max(0,(Math.min(b,e)-Math.max(a,s))/day);
  const out={};
  for(let y=settlementDate.getFullYear();y<=taxYearEnd.getFullYear();y++){
    const ys=new Date(y,0,1),ye=new Date(y+1,0,1);
    const d1=overlap(settlementDate,homePurchaseDate,ys,ye);
    const d2=overlap(homePurchaseDate,taxYearEnd,ys,ye);
    const p2=initialCash+initialCash*annualRate*days(settlementDate,homePurchaseDate)/365-homePurchasePrice;
    out[y]=initialCash*annualRate*d1/365+p2*annualRate*d2/365;
  }
  return out;
}

export function tax2027({salary=0,pension=0,interestIncome=0,taxableRental=0,taxablePropertyGain=0,personfradrag=114540,trinn=[{fra:226100,sats:.017},{fra:318300,sats:.04},{fra:725050,sats:.137},{fra:980100,sats:.168},{fra:1467200,sats:.178}],trygdeLonn=.076,trygdePensjon=.051,mfLonnSats=.46,mfLonnTak=95700,mfPensjonSats=.40,mfPensjonTak=75400,fellesskattSats=.22,pensionCreditMax=37100,pensionStep1=284950,pensionStep2=436050,pensionRate1=.167,pensionRate2=.06,creditBasis}){
  // creditBasis = den delen av pensjonen som gir rett til pensjonistfradrag (standard: hele pensjonen)
  const cb=creditBasis===undefined?pension:creditBasis;
  const person=salary+pension;
  let bracket=0;
  for(let i=0;i<trinn.length;i++){const lo=trinn[i].fra,hi=i<trinn.length-1?trinn[i+1].fra:Infinity;if(person>lo)bracket+=(Math.min(person,hi)-lo)*trinn[i].sats}
  const socialSalary=salary*trygdeLonn,socialPension=pension*trygdePensjon;
  const mf=Math.min(salary*mfLonnSats+Math.min(pension*mfPensjonSats,mfPensjonTak),mfLonnTak);
  const capitalIncome=interestIncome+taxableRental+taxablePropertyGain;
  const ordinaryIncome=Math.max(0,person+capitalIncome-mf-personfradrag);
  const common=ordinaryIncome*fellesskattSats;
  let credit=cb>0?pensionCreditMax:0;
  if(cb>pensionStep1)credit-=Math.min(cb-pensionStep1,pensionStep2-pensionStep1)*pensionRate1;
  if(cb>pensionStep2)credit-=(cb-pensionStep2)*pensionRate2;
  credit=Math.max(0,Math.min(credit,bracket+socialSalary+socialPension+common));
  return {bracket,socialSalary,socialPension,minimumDeduction:mf,capitalIncome,ordinaryIncome,common,pensionCredit:credit,total:Math.max(0,bracket+socialSalary+socialPension+common-credit)};
}

export function primaryResidenceTaxValue(marketValue,{tak=14000000,satsUnder=.25,satsOver=.70}={}){return marketValue<=tak?marketValue*satsUnder:tak*satsUnder+(marketValue-tak)*satsOver}
export function wealthTax2027(netWealth,jointTaxation=false,{bunnfradragSingle=1900000,trinn2BreddeSingle=19600000,sats1=.01,sats2=.011}={}){const threshold=jointTaxation?bunnfradragSingle*2:bunnfradragSingle;const firstBand=jointTaxation?trinn2BreddeSingle*2:trinn2BreddeSingle;const taxable=Math.max(0,netWealth-threshold);return Math.min(taxable,firstBand)*sats1+Math.max(0,taxable-firstBand)*sats2}
