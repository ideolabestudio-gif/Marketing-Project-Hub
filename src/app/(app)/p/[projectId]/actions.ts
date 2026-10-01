"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formString, runAction, type ActionState } from "@/lib/action-state";
import { projectContextForAction } from "@/lib/project-page";
import { openCycle } from "@/modules/cycles/service";

export async function openCycleAction(projectId: string, _: ActionState, formData: FormData) {
  let period: string | undefined;
  const result = await runAction(async () => {
    const ctx = await projectContextForAction(projectId, "cycle.manage");
    period = (await openCycle(ctx, { period: formString(formData, "period") })).period;
    revalidatePath(`/p/${projectId}`);
  }, "Ciclo abierto");
  if (result?.ok && period) redirect(`/p/${projectId}/ciclos/${period}`);
  return result;
}
