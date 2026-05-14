// Small JSON-on-disk helper with atomic writes and proper-lockfile-based.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import properLockfile from "proper-lockfile";

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

export async function updateJson<T>(filePath: string, mutate: (current: T | null) => T): Promise<T> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(filePath, "{}", { flag: "ax" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
  const release = await properLockfile.lock(filePath, {
    retries: { retries: 5, minTimeout: 25, maxTimeout: 200 },
  });
  try {
    const current = await readJson<T>(filePath);
    const next = mutate(current);
    await writeJson(filePath, next);
    return next;
  } finally {
    await release();
  }
}
