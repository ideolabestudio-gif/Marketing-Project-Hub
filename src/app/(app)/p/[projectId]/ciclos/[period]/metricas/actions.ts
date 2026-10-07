"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString, runAction, type ActionState } from "@/lib/action-state";
import { ValidationError } from "@/lib/errors";
import { projectContextForAction } from "@/lib/project-page";
import { applyMetricImport, discardMetricImport, recordMetricValue, uploadMetricCsv } from "@/modules/metrics/service";
import { AGGREGATIONS, NUMBER_FORMATS } from "@/modules/metrics/csv";

export async function recordValueAction(
  projectId: string,
  cycleId: string,
  channelId: string,
  _: ActionState,
  formData: FormData,
) {
  return runAction(async () => {
    const ctx = await projectContextForAction(projectId, "metrics.write");
    await recordMetricValue(ctx, {
      cycleId,
      channelId,
      metricKey: formString(formData, "metricKey"),
      value: formString(formData, "value"),
      numberFormat: formString(formData, "numberFormat") as (typeof NUMBER_FORMATS)[number],
      note: formString(formData, "note"),
    });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Valor registrado");
}

export async function uploadCsvAction(
  projectId: string,
  cycleId: string,
  period: string,
  _: ActionState,
  formData: FormData,
) {
  let importId: string | undefined;
  const result = await runAction(async () => {
    const ctx = await projectContextForAction(projectId, "metrics.write");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Elige un archivo CSV");
    if (file.size > 1024 * 1024) throw new ValidationError("El archivo es demasiado grande (máximo 1 MB)");
    importId = (
      await uploadMetricCsv(ctx, {
        cycleId,
        channelId: formString(formData, "channelId"),
        filename: file.name,
        text: await file.text(),
      })
    ).id;
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Archivo subido");
  if (result?.ok && importId) redirect(`/p/${projectId}/ciclos/${period}/metricas/importar/${importId}`);
  return result;
}

export async function applyImportAction(
  projectId: string,
  importId: string,
  period: string,
  metricKeys: string[],
  _: ActionState,
  formData: FormData,
) {
  const result = await runAction(async () => {
    const ctx = await projectContextForAction(projectId, "metrics.write");
    const mappings = [];
    for (const metricKey of metricKeys) {
      const column = formString(formData, `column:${metricKey}`);
      if (column === "") continue;
      mappings.push({
        metricKey,
        column: Number(column),
        aggregation: formString(formData, `aggregation:${metricKey}`) as (typeof AGGREGATIONS)[number],
      });
    }
    await applyMetricImport(ctx, {
      importId,
      numberFormat: formString(formData, "numberFormat") as (typeof NUMBER_FORMATS)[number],
      mappings,
    });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Importación aplicada");
  if (result?.ok) redirect(`/p/${projectId}/ciclos/${period}/metricas`);
  return result;
}

export async function discardImportAction(projectId: string, importId: string, period: string) {
  const result = await runAction(async () => {
    const ctx = await projectContextForAction(projectId, "metrics.write");
    await discardMetricImport(ctx, { importId });
    revalidatePath(`/p/${projectId}`, "layout");
  }, "Importación descartada");
  if (result?.ok) redirect(`/p/${projectId}/ciclos/${period}/metricas`);
  return result;
}
