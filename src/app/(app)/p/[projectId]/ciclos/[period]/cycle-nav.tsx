"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  base: string;
  label: string;
  prev: { href: string; label: string } | null;
  next: { href: string; label: string } | null;
  reportHint: string;
};

const SECTIONS = ["/brief", "/metricas", "/informe"] as const;

/** Pestañas del mes (Plan, Brief, Métricas, Informe), también dentro de una pieza o de una importación. */
export function CycleNav({ base, label, prev, next, reportHint }: Props) {
  const pathname = usePathname();
  const section = SECTIONS.find((s) => pathname.startsWith(`${base}${s}`)) ?? "";
  const tabs = [
    { href: base, label: "Plan", active: section === "" },
    { href: `${base}/brief`, label: "Brief", active: section === "/brief" },
    { href: `${base}/metricas`, label: "Métricas", active: section === "/metricas" },
    { href: `${base}/informe`, label: "Informe", hint: reportHint, active: section === "/informe" },
  ];
  // Las flechas llevan a la misma sección del mes anterior o siguiente.
  const arrow = (target: { href: string; label: string } | null, dir: "prev" | "next") =>
    target ? (
      <Link
        href={`${target.href}${section}`}
        className="btn btn-secondary px-2.5 py-1"
        aria-label={`${dir === "prev" ? "Mes anterior" : "Mes siguiente"}: ${target.label}`}
        title={target.label}
      >
        <span aria-hidden="true">{dir === "prev" ? "‹" : "›"}</span>
      </Link>
    ) : (
      <span className="btn btn-secondary invisible px-2.5 py-1" aria-hidden="true">
        ‹
      </span>
    );
  return (
    <div className="no-print flex flex-wrap items-center gap-2 border-b border-border">
      <nav className="tabs grow" aria-label="Secciones del mes">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined}>
            {t.label}
            {t.hint && <span className="ml-1 text-xs text-muted">· {t.hint}</span>}
          </Link>
        ))}
      </nav>
      <div className="mb-1.5 flex items-center gap-1">
        {arrow(prev, "prev")}
        <span className="px-1 text-sm font-medium whitespace-nowrap">{label}</span>
        {arrow(next, "next")}
      </div>
    </div>
  );
}
