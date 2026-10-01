"use server";

import { redirect } from "next/navigation";
import { endCurrentSession } from "@/modules/identity/next";

export async function logoutAction() {
  await endCurrentSession();
  redirect("/login");
}
