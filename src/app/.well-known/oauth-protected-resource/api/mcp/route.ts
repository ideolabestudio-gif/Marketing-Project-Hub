import { GET as resourceMetadata } from "../../route";

export const dynamic = "force-dynamic";

/** Misma respuesta en la ruta con el sufijo del recurso (RFC 9728, apartado 3.1). */
export function GET() {
  return resourceMetadata();
}

export { OPTIONS } from "../../route";
