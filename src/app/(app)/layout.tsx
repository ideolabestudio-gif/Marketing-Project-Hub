import Link from "next/link";
import { requireActor } from "@/modules/identity/next";
import { logoutAction } from "./actions";

// Esta comprobación es solo para pintar la cabecera: cada página y cada acción
// vuelven a comprobar la sesión y los permisos por su cuenta.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 px-6 py-2.5 text-sm">
          <Link href="/" className="mr-4 flex items-center gap-2.5 font-semibold tracking-tight">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-lg bg-accent text-xs font-bold text-on-accent shadow-(--shadow)"
            >
              MH
            </span>
            Marketing Project Hub
          </Link>
          <Link href="/" className="nav-link">
            Mis proyectos
          </Link>
          <Link href="/conexiones" className="nav-link">
            Conexiones
          </Link>
          {actor.isAdmin && (
            <Link href="/admin" className="nav-link">
              Administración
            </Link>
          )}
          <span className="mr-3 ml-auto hidden text-muted sm:inline">{actor.email}</span>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-secondary">
              Salir
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
