import Link from "next/link";

export type Crumb = { label: string; href: string };

/**
 * Migas de pan: el camino hasta la página actual (sin incluirla; su nombre es el h1).
 * Sustituyen a los antiguos enlaces «← …», que solo subían un nivel.
 */
export function Breadcrumbs({ items, help }: { items: Crumb[]; help?: string }) {
  return (
    <div className="no-print flex grow items-start justify-between gap-3">
      <nav aria-label="Estás en" className="text-sm">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted">
          {items.map((c, i) => (
            <li key={c.href} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-border-strong">
                  /
                </span>
              )}
              <Link href={c.href} className="link text-muted">
                {c.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      {help && <HelpLink section={help} />}
    </div>
  );
}

/** Enlace a la parte de la ayuda que explica la página en la que se está. */
export function HelpLink({ section }: { section: string }) {
  return (
    <Link href={`/ayuda#${section}`} className="no-print link shrink-0 text-sm text-muted">
      <span aria-hidden="true">?</span> Ayuda<span className="sr-only"> sobre esta página</span>
    </Link>
  );
}

/** Camino hasta la página de resumen de un proyecto. */
export function projectCrumbs(projectId: string, projectName: string): Crumb[] {
  return [
    { label: "Inicio", href: "/" },
    { label: projectName, href: `/p/${projectId}` },
  ];
}

/** Camino hasta el plan de un mes. `monthLabel` es el mes ya formateado («Octubre de 2026»). */
export function cycleCrumbs(projectId: string, projectName: string, period: string, monthLabel: string): Crumb[] {
  return [...projectCrumbs(projectId, projectName), { label: monthLabel, href: `/p/${projectId}/ciclos/${period}` }];
}
