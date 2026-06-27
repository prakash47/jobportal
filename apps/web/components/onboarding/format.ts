// Format a raw digit string with Indian thousands separators (lakh/crore
// grouping): "800000" → "8,00,000", "1200000" → "12,00,000". Empty in → empty
// out. The onboarding salary fields keep their state as raw digits (so the
// rupees→paise save math is untouched) and only run the value through this for
// display; onChange strips the separators straight back to digits.
export function formatINR(digits: string): string {
  if (!digits) return '';
  const n = Number(digits);
  if (!Number.isFinite(n)) return digits;
  return n.toLocaleString('en-IN');
}
