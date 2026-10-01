import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Fronteras de arquitectura (docs/03-arquitectura.md). Si una regla molesta, la
// solución es usar el servicio del módulo, no desactivar la regla.
const NO_REPO_FROM_OTHER_MODULES = {
  group: ["@/modules/*/repo", "../*/repo", "../../*/repo"],
  message: "Usa el service.ts del otro módulo; su repo.ts es privado.",
};
const NO_DB = {
  group: ["@/lib/db/client", "@/lib/db/client.*"],
  message: "Solo los repo.ts de cada módulo acceden a la base de datos.",
};
const NO_DB_SCHEMA = {
  group: ["@/lib/db", "@/lib/db/*", "@/lib/db/**"],
  message: "La UI no accede a la base de datos: usa los servicios de los módulos.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/**", "src/components/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_DB_SCHEMA, NO_REPO_FROM_OTHER_MODULES] }],
    },
  },
  {
    files: ["src/modules/**", "src/lib/**"],
    ignores: ["src/modules/*/repo.ts", "src/lib/db/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_DB, NO_REPO_FROM_OTHER_MODULES] }],
    },
  },
  {
    files: ["src/modules/*/repo.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_REPO_FROM_OTHER_MODULES] }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
