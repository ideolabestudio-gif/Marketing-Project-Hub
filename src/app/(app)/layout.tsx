import Link from "next/link";
import { requireActor } from "@/modules/identity/next";
import { IdeolabLogo } from "@/components/ideolab-logo";
import { logoutAction } from "./actions";

// Esta comprobación es solo para pintar la cabecera: cada página y cada acción
// vuelven a comprobar la sesión y los permisos por su cuenta.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-6 py-2.5 text-sm whitespace-nowrap">
          <Link href="/" className="mr-4 flex shrink-0 items-center gap-3 font-semibold tracking-tight">
            <IdeolabLogo className="h-4 w-auto" title="Ideolab" />
            <span className="hidden border-l border-border-strong pl-3 md:inline">Marketing Project Hub</span>
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
