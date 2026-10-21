"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  base: string;
  /** Mes al que lleva la pestaña del mes (el en curso o, si no existe, el último abierto). */
  month: { period: string; label: string } | null;
  canSettings: boolean;
};

/** Pestañas del proyecto, iguales en todas sus páginas. */
export function ProjectNav({ base, month, canSettings }: Props) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Resumen", active: pathname === base },
    ...(month
      ? [{ href: `${base}/ciclos/${month.period}`, label: month.label, active: pathname.startsWith(`${base}/ciclos/${month.period}`) }]
      : []),
    { href: `${base}/ficha`, label: "Ficha del cliente", active: pathname.startsWith(`${base}/ficha`) },
    ...(canSettings ? [{ href: `${base}/ajustes`, label: "Ajustes", active: pathname.startsWith(`${base}/ajustes`) }] : []),
  ];
  return (
    <nav className="tabs" aria-label="Proyecto">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
