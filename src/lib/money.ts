/** Prices are integer minor units; the POS sends decimals and we convert once, exactly. */
export function toMinor(amount: number, decimals: number): number {
  return Math.round(amount * 10 ** decimals);
}

export function formatMoney(minor: number, decimals: number, symbol: string, lang: string): string {
  const value = minor / 10 ** decimals;
  const text = new Intl.NumberFormat(lang === "ar" ? "ar-JO-u-nu-latn" : "en-US", {
    minimumFractionDigits: decimals > 0 ? Math.min(2, decimals) : 0,
    maximumFractionDigits: decimals,
  }).format(value);
  return lang === "ar" ? `${text} ${symbol}` : `${symbol} ${text}`;
}
