"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  current: string;
  projects: { projectId: string; projectName: string; clientName: string }[];
};

/**
 * Cambiar de proyecto sin volver al inicio. Desde la ficha se va a la ficha del otro
 * proyecto; desde cualquier otra página, a su resumen (los meses y ajustes no tienen por
 * qué existir o estar permitidos en el otro).
 */
export function ProjectSwitcher({ current, projects }: Props) {
  const pathname = usePathname();
  const others = projects.filter((p) => p.projectId !== current);
  if (others.length === 0) return null;
  const suffix = pathname.startsWith(`/p/${current}/ficha`) ? "/ficha" : "";
  return (
    <details key={pathname} className="relative text-sm">
      <summary className="rounded-md px-2 py-1 hover:text-foreground">Cambiar de proyecto</summary>
      <ul className="absolute left-0 z-30 mt-1 flex max-h-80 w-72 flex-col overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-(--shadow-hover)">
        {others.map((p) => (
          <li key={p.projectId}>
            <Link
              href={`/p/${p.projectId}${suffix}`}
              className="block rounded-md px-3 py-2 hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-(--ring) focus-visible:outline-none"
            >
              <span className="block text-xs text-muted">{p.clientName}</span>
              <span className="block font-medium text-foreground">{p.projectName}</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
