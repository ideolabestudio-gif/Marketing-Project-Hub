import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inject } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");
// Cada archivo de pruebas usa su propio directorio de almacenamiento temporal.
process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "mph-storage-"));
