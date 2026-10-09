"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/modules/identity/next";
import { revokeMyConnection } from "@/modules/oauth/service";

export async function revokeConnectionAction(grantId: string) {
  const actor = await requireActor();
  await revokeMyConnection(actor, grantId);
  revalidatePath("/conexiones");
}
