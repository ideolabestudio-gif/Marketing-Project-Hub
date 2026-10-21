"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Enlaces fijos de la cabecera; el de la sección actual lleva aria-current. */
export function TopNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Mis proyectos", active: pathname === "/" || pathname.startsWith("/p/") },
    { href: "/conexiones", label: "Conexiones", active: pathname.startsWith("/conexiones") },
    { href: "/ayuda", label: "Ayuda", active: pathname.startsWith("/ayuda") },
    ...(isAdmin ? [{ href: "/admin", label: "Administración", active: pathname.startsWith("/admin") }] : []),
  ];
  return (
    <>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="nav-link" aria-current={l.active ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </>
  );
}
