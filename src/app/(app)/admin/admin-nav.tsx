"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  {
    href: "/admin",
    label: "Clientes y proyectos",
    match: (p: string) => p === "/admin" || p.startsWith("/admin/proyectos"),
  },
  { href: "/admin/usuarios", label: "Usuarios", match: (p: string) => p.startsWith("/admin/usuarios") },
  { href: "/admin/metricas", label: "Catálogo de métricas", match: (p: string) => p.startsWith("/admin/metricas") },
];

/** Pestañas de la administración, con el mismo selector que la vista del ciclo. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="segmented self-start" aria-label="Administración">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(pathname) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
