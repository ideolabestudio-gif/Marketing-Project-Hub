import { crc32, deflateRawSync } from "node:zlib";

export type ZipEntry = { name: string; data: Uint8Array | string; date?: Date };

/** Fecha y hora en el formato de MS-DOS que usa ZIP (resolución de 2 s, hora local). */
function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.max(d.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  };
}

/**
 * Crea un archivo ZIP en memoria (sin dependencias). Los nombres van en UTF-8 y cada
 * entrada se comprime con deflate salvo que no gane espacio. Sin ZIP64: hasta 4 GB.
 */
export function createZip(entries: ZipEntry[]): Uint8Array {
  if (entries.length > 0xffff) throw new Error("Demasiados archivos para un ZIP sin ZIP64");
  const encoder = new TextEncoder();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(encoder.encode(entry.name));
    const raw = typeof entry.data === "string" ? Buffer.from(encoder.encode(entry.data)) : Buffer.from(entry.data);
    const deflated = deflateRawSync(raw);
    const stored = deflated.byteLength >= raw.byteLength;
    const body = stored ? raw : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(raw);
    const { date, time } = dosDateTime(entry.date ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.byteLength, 18);
    local.writeUInt32LE(raw.byteLength, 22);
    local.writeUInt16LE(name.byteLength, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // creado por
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.byteLength, 20);
    central.writeUInt32LE(raw.byteLength, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.byteLength + name.byteLength + body.byteLength;
  }
  const centralSize = centrals.reduce((n, b) => n + b.byteLength, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}
