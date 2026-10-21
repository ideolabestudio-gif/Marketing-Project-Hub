import Link from "next/link";
import { requireActor } from "@/modules/identity/next";
import { IdeolabLogo } from "@/components/ideolab-logo";
import { logoutAction } from "./actions";
import { TopNav } from "./top-nav";

// Esta comprobación es solo para pintar la cabecera: cada página y cada acción
// vuelven a comprobar la sesión y los permisos por su cuenta.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  return (
    <div className="min-h-full">
      <a
        href="#contenido"
        className="sr-only z-30 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
        {/* En el móvil, los enlaces bajan a una segunda fila para que quepan enteros. */}
        <nav aria-label="Principal" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 gap-y-1.5 px-6 py-2.5 text-sm whitespace-nowrap sm:flex-nowrap">
          <Link href="/" className="mr-4 flex shrink-0 items-center gap-3 font-semibold tracking-tight">
            <IdeolabLogo className="h-4 w-auto" title="Ideolab" />
            <span className="hidden border-l border-border-strong pl-3 md:inline">Marketing Project Hub</span>
          </Link>
          <div className="order-last -mx-3 flex w-[calc(100%+1.5rem)] gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto">
            <TopNav isAdmin={actor.isAdmin} />
          </div>
          <span className="mr-3 ml-auto hidden text-muted sm:inline">{actor.email}</span>
          <form action={logoutAction} className="ml-auto sm:ml-0">
            <button type="submit" className="btn btn-secondary">
              Salir
            </button>
          </form>
        </nav>
      </header>
      <main id="contenido" tabIndex={-1} className="mx-auto max-w-6xl px-6 py-8 outline-none">{children}</main>
    </div>
  );
}
