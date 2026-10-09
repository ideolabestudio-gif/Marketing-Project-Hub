import { redirect } from "next/navigation";
import { getCurrentActor, safeNextPath } from "@/modules/identity/next";

const ERRORS: Record<string, string> = {
  not_allowed: "Tu email no está dado de alta. Pide acceso a un administrador.",
  inactive: "Tu usuario está desactivado.",
  wrong_domain: "Solo se admiten cuentas del dominio de la organización.",
  email_not_verified: "Tu email de Google no está verificado.",
  account_mismatch: "Este email está asociado a otra cuenta de Google.",
  invalid_request: "La solicitud de inicio de sesión no es válida o ha caducado. Inténtalo de nuevo.",
  google_error: "No se pudo completar el inicio de sesión con Google.",
  not_configured: "El inicio de sesión con Google no está configurado en este entorno.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  if (await getCurrentActor()) redirect(next ?? "/");
  const message = typeof error === "string" ? ERRORS[error] ?? "No se pudo iniciar sesión." : null;

  return (
    <main className="mx-auto mt-24 max-w-sm">
      <div className="card flex flex-col gap-4">
        <h1 className="h1">Marketing Project Hub</h1>
        <p className="text-sm text-muted">Acceso solo para el equipo de Ideolab.</p>
        {message && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {message}
          </p>
        )}
        <a
          href={next ? `/auth/google?next=${encodeURIComponent(next)}` : "/auth/google"}
          className="btn btn-primary justify-center"
        >
          Entrar con Google
        </a>
      </div>
    </main>
  );
}
