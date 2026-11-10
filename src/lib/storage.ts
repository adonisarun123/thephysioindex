import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { del as blobDel, get as blobGet, put as blobPut } from "@vercel/blob";

/**
 * Private object storage (EMR-07, API-01). Nothing stored here is public:
 * reads go through an authorised route that streams the bytes.
 *
 * - `vercel-blob`: a PRIVATE Vercel Blob store (BLOB_READ_WRITE_TOKEN).
 * - `local`: files under STORAGE_LOCAL_DIR; development and tests only,
 *   refused on Vercel.
 * - none configured: uploads are switched off and the UI says so.
 */
export interface PrivateStorage {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array> | Buffer; contentType: string } | null>;
  del(key: string): Promise<void>;
}

class VercelBlobStorage implements PrivateStorage {
  readonly name = "vercel-blob";
  async put(key: string, body: Buffer, contentType: string) {
    await blobPut(key, body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
  }
  async get(key: string) {
    const r = await blobGet(key, { access: "private" });
    if (!r || !r.stream) return null;
    return { body: r.stream, contentType: r.blob.contentType ?? "application/octet-stream" };
  }
  async del(key: string) {
    await blobDel(key);
  }
}

class LocalStorage implements PrivateStorage {
  readonly name = "local";
  constructor(private root: string) {}
  private path(key: string) {
    const p = resolve(this.root, key);
    if (!p.startsWith(resolve(this.root))) throw new Error("bad storage key");
    return p;
  }
  async put(key: string, body: Buffer, contentType: string) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body, { flag: "wx" });
    await writeFile(`${p}.type`, contentType);
  }
  async get(key: string) {
    try {
      const p = this.path(key);
      return { body: await readFile(p), contentType: (await readFile(`${p}.type`, "utf8")).trim() };
    } catch {
      return null;
    }
  }
  async del(key: string) {
    const p = this.path(key);
    await rm(p, { force: true });
    await rm(`${p}.type`, { force: true });
  }
}

let storage: PrivateStorage | null | undefined;
export function privateStorage(): PrivateStorage | null {
  if (storage !== undefined) return storage;
  if (process.env.BLOB_READ_WRITE_TOKEN) storage = new VercelBlobStorage();
  else if (process.env.STORAGE_LOCAL_DIR && !process.env.VERCEL) storage = new LocalStorage(join(process.env.STORAGE_LOCAL_DIR));
  else storage = null;
  return storage;
}

/** Tests only. */
export function setPrivateStorageForTests(s: PrivateStorage | null) {
  storage = s;
}
