// V2 engine model: separates when income is earned from when tax is paid.
// This is intentionally small and pure so it can be unit-tested independently.

export function buildCapitalTimeline({
  settlementDate,
  homePurchaseDate,
  taxDueDate,
  initialCash,
  homePurchasePrice,
  annualRate,
  interestTaxRate,
  landGainTax,
}) {
  const day = 86400000;
  const days = (a, b) => Math.max(0, (b - a) / day);
  const interest = (principal, start, end) => principal * annualRate * days(start, end) / 365;

  const interestToPurchase = interest(initialCash, settlementDate, homePurchaseDate);
  const cashAfterPurchase = initialCash + interestToPurchase - homePurchasePrice;
  const interestAfterPurchase = interest(cashAfterPurchase, homePurchaseDate, taxDueDate);
  const totalInterest = interestToPurchase + interestAfterPurchase;

  return {
    settlementDate,
    homePurchaseDate,
    taxDueDate,
    initialCash,
    homePurchasePrice,
    interestToPurchase,
    cashAfterPurchase,
    interestAfterPurchase,
    totalInterest,
    interestTax: totalInterest * interestTaxRate,
    landGainTax,
    totalCapitalTax: landGainTax + totalInterest * interestTaxRate,
    cashBeforeTax: cashAfterPurchase + interestAfterPurchase,
    cashAfterTax: cashAfterPurchase + interestAfterPurchase - landGainTax - totalInterest * interestTaxRate,
  };
}

export function allocateInterestToTaxYears({
  settlementDate,
  homePurchaseDate,
  taxDueDate,
  initialCash,
  homePurchasePrice,
  annualRate,
}) {
  const day = 86400000;
  const days = (a, b) => Math.max(0, (b - a) / day);
  const overlap = (a, b, start, end) => Math.max(0, (Math.min(b, end) - Math.max(a, start)) / day);
  const result = {};

  for (let year = settlementDate.getFullYear(); year <= taxDueDate.getFullYear(); year += 1) {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const d1 = overlap(settlementDate, homePurchaseDate, yearStart, yearEnd);
    const d2 = overlap(homePurchaseDate, taxDueDate, yearStart, yearEnd);
    const amount = initialCash * annualRate * d1 / 365 +
      (initialCash + initialCash * annualRate * days(settlementDate, homePurchaseDate) / 365 - homePurchasePrice) * annualRate * d2 / 365;
    result[year] = amount;
  }
  return result;
}
