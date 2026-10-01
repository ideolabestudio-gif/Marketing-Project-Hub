import type { TestProject } from "vitest/node";
import { createMigratedDatabase } from "./database";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const url = await createMigratedDatabase("mph_test");
  project.provide("databaseUrl", url);
}
