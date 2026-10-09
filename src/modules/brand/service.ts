import { z } from "zod";
import { ConflictError, ValidationError } from "@/lib/errors";
import { isUniqueViolation, parseInput } from "@/lib/validation";
import { authorize, type ProjectContext } from "@/modules/access/context";
import { recordAudit } from "@/modules/audit/service";
import * as repo from "./repo";

// Ficha del cliente: contexto de marca estable del proyecto. Cada guardado crea una
// versión nueva (las anteriores no cambian) y la IA recibe siempre la vigente.

export type BrandProfile = repo.BrandProfileRow;

export const BRAND_FIELDS = [
  { key: "about", label: "Quién es el cliente", hint: "A qué se dedica, historia, valores, dónde está." },
  { key: "audience", label: "Público", hint: "A quién se dirige: edad, intereses, tipo de cliente." },
  { key: "voice", label: "Tono de voz", hint: "Cercano o formal, tú o usted, emojis sí o no, ejemplos de frases." },
  { key: "offering", label: "Productos y servicios", hint: "Lo que vende, lo más importante y lo que se quiere impulsar." },
  { key: "keywords", label: "Palabras clave y hashtags", hint: "Términos, hashtags y menciones que se usan siempre." },
  { key: "avoid", label: "Qué evitar", hint: "Temas, palabras o enfoques que no se deben usar." },
] as const satisfies readonly { key: keyof repo.BrandProfileFields; label: string; hint: string }[];

/** Ficha vigente (o null si todavía no se ha rellenado) y la lista de versiones. */
export async function getBrandProfile(ctx: ProjectContext) {
  await authorize(ctx, "project.read");
  const [current, versions] = await Promise.all([repo.findLatestProfile(ctx), repo.listProfileVersions(ctx)]);
  return { current: current ?? null, versions };
}

const field = z
  .string()
  .max(5000, "Cada apartado admite como máximo 5.000 caracteres")
  .default("")
  .transform((v) => v.replace(/\r\n/g, "\n").trim());

const profileSchema = z.object({
  about: field,
  audience: field,
  voice: field,
  offering: field,
  keywords: field,
  avoid: field,
});

/** Guarda la ficha como una versión nueva. */
export async function saveBrandProfile(ctx: ProjectContext, input: z.input<typeof profileSchema>) {
  await authorize(ctx, "project.settings");
  const data = parseInput(profileSchema, input);
  const prev = await repo.findLatestProfile(ctx);
  const keys = BRAND_FIELDS.map((f) => f.key);
  if (prev ? keys.every((k) => prev[k] === data[k]) : keys.every((k) => data[k] === "")) {
    throw new ValidationError(prev ? "No hay cambios respecto a la ficha actual" : "La ficha está vacía");
  }
  try {
    const row = await repo.insertProfileVersion(ctx, data);
    await recordAudit({
      action: "brand_profile.saved",
      actorId: ctx.actor.userId,
      projectId: ctx.projectId,
      entityType: "brand_profile",
      entityId: row.id,
      data: { versionNo: row.versionNo },
    });
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Alguien ha guardado la ficha a la vez. Recarga y repite.");
    throw err;
  }
}
