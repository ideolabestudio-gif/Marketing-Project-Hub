/**
 * Comprobación determinista para textos de la IA sobre métricas: lista las cifras del
 * texto que no aparecen en los datos que recibió. No corrige nada; avisa a quien revisa.
 */
const TOKEN = /\d[\d.,]*/g;

function parse(token: string): { value: number; decimals: number } | null {
  const t = token.replace(/[.,]+$/, "");
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) normalized = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) normalized = t.replace(/,/g, "");
  else if (/^\d+,\d+$/.test(t)) normalized = t.replace(",", ".");
  else if (/^\d+(\.\d+)?$/.test(t)) normalized = t;
  else return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const decimals = normalized.includes(".") ? normalized.split(".")[1].length : 0;
  return { value, decimals };
}

function numbersIn(text: string) {
  return [...text.matchAll(TOKEN)].flatMap((m) => {
    const n = parse(m[0]);
    return n ? [{ raw: m[0].replace(/[.,]+$/, ""), ...n }] : [];
  });
}

export function findUnverifiedNumbers(output: string, data: string): string[] {
  const known = numbersIn(data).map((n) => n.value);
  const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
  const unverified = numbersIn(output).filter(
    (n) => !known.some((k) => round(k, n.decimals) === n.value),
  );
  return [...new Set(unverified.map((n) => n.raw))];
}
