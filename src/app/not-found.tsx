import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-10">
      <h1 className="h1">No encontrado</h1>
      <p className="mt-2 text-muted">La página no existe o no tienes acceso.</p>
      <Link href="/" className="link mt-4 inline-block">
        Volver a mis proyectos
      </Link>
    </main>
  );
}
