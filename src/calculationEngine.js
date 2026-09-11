// Eiendomsalg V2 calculation helpers.
// Date-aware interest allocation: each day's interest belongs to the calendar year
// in which the cash is actually invested. Tax on capital income is reported by year,
// while settlement timing remains a separate cash-flow concern.

export const DAY_MS = 86400000;

export function daysBetween(a, b) {
  return Math.max(0, (b - a) / DAY_MS);
}

export function overlapDays(aStart, aEnd, bStart, bEnd) {
  const start = new Date(Math.max(aStart.getTime(), bStart.getTime()));
  const end = new Date(Math.min(aEnd.getTime(), bEnd.getTime()));
  return daysBetween(start, end);
}

export function yearBounds(year) {
  return [new Date(year, 0, 1), new Date(year + 1, 0, 1)];
}

export function annualSimpleInterest(principal, annualRate, start, end) {
  return principal * annualRate * (daysBetween(start, end) / 365);
}

export function interestByYear(principal, annualRate, start, end) {
  const result = {};
  for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
    const [yStart, yEnd] = yearBounds(year);
    const days = overlapDays(start, end, yStart, yEnd);
    if (days > 0) result[year] = annualSimpleInterest(principal, annualRate, new Date(Math.max(start, yStart)), new Date(Math.min(end, yEnd)));
  }
  return result;
}

export function capitalIncomeTaxByYear(interestMap, rate) {
  return Object.fromEntries(Object.entries(interestMap).map(([year, amount]) => [year, amount * rate]));
}
