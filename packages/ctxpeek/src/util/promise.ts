/** Race promises that may reject. Resolves with the first fulfilled value
 * matching `predicate`. Resolves to `null` if every promise rejects or
 * fails the predicate. Never rejects. */
export async function raceUntil<T>(
  promises: ReadonlyArray<Promise<T | null | undefined>>,
  predicate: (v: T) => boolean = () => true,
): Promise<T | null> {
  if (promises.length === 0) return null;
  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === "fulfilled" && r.value && predicate(r.value)) return r.value;
  }
  return null;
}

/** Sleep for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wrap a promise with a timeout. Throws `TimeoutError` if not settled by `ms`. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(ms)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
