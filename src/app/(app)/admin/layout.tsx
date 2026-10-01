import Link from "next/link";
import { requireAdminActor } from "@/modules/identity/next";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdminActor();
  return (
    <div className="flex flex-col gap-6">
      <nav className="flex gap-4 text-sm">
        <Link href="/admin" className="link">
          Clientes y proyectos
        </Link>
        <Link href="/admin/usuarios" className="link">
          Usuarios
        </Link>
      </nav>
      {children}
    </div>
  );
}
