import Link from "next/link";
import { requireActor } from "@/modules/identity/next";
import { logoutAction } from "./actions";

// Esta comprobación es solo para pintar la cabecera: cada página y cada acción
// vuelven a comprobar la sesión y los permisos por su cuenta.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  return (
    <div className="min-h-full">
      <header className="border-b border-border bg-surface">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3 text-sm">
          <Link href="/" className="font-semibold">
            Marketing Project Hub
          </Link>
          <Link href="/" className="link">
            Mis proyectos
          </Link>
          {actor.isAdmin && (
            <Link href="/admin" className="link">
              Administración
            </Link>
          )}
          <span className="ml-auto text-muted">{actor.email}</span>
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
