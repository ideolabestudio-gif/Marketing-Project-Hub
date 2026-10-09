"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/modules/identity/next";
import { approveAuthorization, denyAuthorization } from "@/modules/oauth/service";

function paramsFrom(formData: FormData): Record<string, string> {
  try {
    const value: unknown = JSON.parse(String(formData.get("params") ?? "{}"));
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
  } catch {
    return {};
  }
}

export async function approveAction(formData: FormData) {
  const actor = await requireActor();
  redirect(await approveAuthorization(actor, paramsFrom(formData)));
}

export async function denyAction(formData: FormData) {
  await requireActor();
  redirect(await denyAuthorization(paramsFrom(formData)));
}
