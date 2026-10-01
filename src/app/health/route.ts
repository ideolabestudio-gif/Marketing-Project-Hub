/** Comprobación de salud para la plataforma de alojamiento. No expone datos. */
export function GET() {
  return Response.json({ ok: true });
}
