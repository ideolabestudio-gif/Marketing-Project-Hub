/** Separa "Asunto: …" y "Preencabezado: …" del borrador de un email (si vienen). */
export function splitEmailDraft(output: string): { subject: string; preheader: string; body: string } {
  const lines = output.split("\n");
  let subject = "";
  let preheader = "";
  let i = 0;
  for (; i < Math.min(lines.length, 4); i++) {
    const line = lines[i].trim();
    const s = /^asunto\s*:\s*(.*)$/i.exec(line);
    const p = /^preencabezado\s*:\s*(.*)$/i.exec(line);
    if (s) subject = s[1];
    else if (p) preheader = p[1];
    else if (line !== "" || (!subject && !preheader)) break;
  }
  return { subject, preheader, body: lines.slice(i).join("\n").trim() };
}
