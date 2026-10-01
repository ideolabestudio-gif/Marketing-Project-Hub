import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

async function restrictedImportErrors(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

describe("fronteras entre capas (criterio F0)", () => {
  it("la UI no puede importar la base de datos", async () => {
    const errors = await restrictedImportErrors(
      "src/app/ejemplo/page.tsx",
      'import { getDb } from "@/lib/db/client";\nexport default function P() { return getDb ? null : null; }\n',
    );
    expect(errors).toHaveLength(1);
  });

  it("la UI no puede importar un repo.ts", async () => {
    const errors = await restrictedImportErrors(
      "src/app/ejemplo/page.tsx",
      'import { listChannels } from "@/modules/projects/repo";\nexport const x = listChannels;\n',
    );
    expect(errors).toHaveLength(1);
  });

  it("un módulo no puede importar el repo.ts de otro módulo", async () => {
    const errors = await restrictedImportErrors(
      "src/modules/projects/service.ts",
      'import { findMembership } from "@/modules/access/repo";\nexport const x = findMembership;\n',
    );
    expect(errors).toHaveLength(1);
  });

  it("un servicio no puede usar la base de datos directamente", async () => {
    const errors = await restrictedImportErrors(
      "src/modules/projects/service.ts",
      'import { getDb } from "@/lib/db/client";\nexport const x = getDb;\n',
    );
    expect(errors).toHaveLength(1);
  });

  it("un repo.ts sí puede usar la base de datos", async () => {
    const errors = await restrictedImportErrors(
      "src/modules/projects/repo.ts",
      'import { getDb } from "@/lib/db/client";\nexport const x = getDb;\n',
    );
    expect(errors).toHaveLength(0);
  });
});
