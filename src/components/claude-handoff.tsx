import type { ReactNode } from "react";
import { CopyButton } from "./copy-button";

type Props = {
  id?: string;
  title: string;
  /** Una frase de para qué sirve. */
  intro?: ReactNode;
  /** Conector que debe tener activado el chat de Claude («Metricool», «MailerLite»…). */
  connector: string;
  /** Qué hacer al volver al Hub, tercer paso. */
  after: string;
  text: string;
  copyLabel?: string;
  /** Sin tarjeta propia, para meterlo dentro de otra. */
  bare?: boolean;
  /** Avisos o listas entre la introducción y los pasos. */
  children?: ReactNode;
};

/**
 * Bloque «Pedirlo a Claude», igual en todo el Hub: tres pasos (copiar, pegar en un chat con
 * el conector, volver) y el texto plegado para revisarlo antes de copiarlo.
 */
export function ClaudeHandoff({
  id,
  title,
  intro,
  connector,
  after,
  text,
  copyLabel = "Copiar para Claude",
  bare,
  children,
}: Props) {
  const body = (
    <>
      <div>
        <h2 className="h2">{title}</h2>
        {intro && <p className="mt-1 text-sm">{intro}</p>}
      </div>
      {children}
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
        <li>Copia el texto con el botón.</li>
        <li>
          Pégalo en un chat de Claude que tenga activado el conector de <strong>{connector}</strong>.
        </li>
        <li>{after}</li>
      </ol>
      <details className="text-sm">
        <summary>Ver el texto</summary>
        <pre className="tile mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap">{text}</pre>
      </details>
      <CopyButton text={text} label={copyLabel} />
    </>
  );
  if (bare) return <div className="flex flex-col gap-3">{body}</div>;
  return (
    <section id={id} className="card flex scroll-mt-20 flex-col gap-3">
      {body}
    </section>
  );
}
