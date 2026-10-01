import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Almacenamiento de archivos (puerto + adaptador). Hoy: disco local (en Render, un disco
 * persistente). Se puede sustituir por un adaptador S3 sin tocar los módulos.
 * Las claves siempre tienen la forma projects/{projectId}/assets/{assetId}.
 */
export interface StorageProvider {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const KEY_RE = new RegExp(`^projects/${UUID}/assets/${UUID}$`);

export function assetStorageKey(projectId: string, assetId: string): string {
  const key = `projects/${projectId}/assets/${assetId}`;
  assertValidKey(key);
  return key;
}

function assertValidKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error("Clave de almacenamiento no válida");
}

class LocalDiskStorage implements StorageProvider {
  constructor(private readonly root: string) {}

  private path(key: string): string {
    assertValidKey(key);
    return join(this.root, key);
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, bytes, { flag: "wx" });
    await rename(tmp, target);
  }

  async get(key: string): Promise<Uint8Array> {
    return readFile(this.path(key));
  }
}

export function getStorage(): StorageProvider {
  return new LocalDiskStorage(resolve(process.env.STORAGE_DIR || ".storage"));
}
