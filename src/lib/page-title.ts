import type { Metadata } from "next";
import { orNotFound, projectContextForPage } from "@/lib/project-page";
import { formatPeriod } from "@/lib/time";
import { getItemDetail } from "@/modules/content/service";
import { getProject } from "@/modules/projects/service";

/**
 * Título de la pestaña del navegador en las páginas de un proyecto, de lo concreto a lo
 * general («Métricas · Octubre de 2026 · Byra»), para distinguir pestañas y para que los
 * lectores de pantalla anuncien dónde se ha llegado.
 */
export async function projectTitle(projectId: string, ...parts: string[]): Promise<Metadata> {
  const ctx = await projectContextForPage(projectId);
  const project = await getProject(ctx);
  return { title: [...parts, project.name].join(" · ") };
}

/** Igual, para páginas de un mes: añade el mes tras las partes dadas. */
export async function cycleTitle(projectId: string, period: string, ...parts: string[]): Promise<Metadata> {
  return projectTitle(projectId, ...parts, formatPeriod(period));
}

/** Para la página de una pieza y su historial: el título de la pieza va en la pestaña. */
export async function itemTitle(projectId: string, period: string, itemId: string, ...parts: string[]): Promise<Metadata> {
  const ctx = await projectContextForPage(projectId);
  const { item } = await orNotFound(getItemDetail(ctx, itemId));
  return cycleTitle(projectId, period, ...parts, item.title);
}
