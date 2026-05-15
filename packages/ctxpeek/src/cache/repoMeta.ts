// Per-repo metadata + negative cache + in-flight dedup.
//
// One unified module to keep three rate-limit savings in one place:
//   - 7-day on-disk cache of (defaultBranch, stars, description, latestTag)
//     so default-branch + literal lookups skip the REST round-trip.
//   - 5-minute in-memory negative cache of 404s on owner/repo and ref.
//     A typo'd slug retried in a loop won't keep burning budget.
//   - In-flight promise dedup. Two parallel resolves of the same slug
//     share one network call.

import { readJson, updateJson } from "../util/jsonStore.js";

const REPO_META_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LATEST_TAG_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;

export type RepoMetaRecord = {
  readonly forge: string;
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  readonly stars: number;
  readonly description: string | null;
  readonly latestTag: string | null;
  readonly latestTagFetchedAt: string | null;
  readonly fetchedAt: string;
};

type RepoMetaFile = {
  readonly version: number;
  readonly entries: Record<string, RepoMetaRecord>;
  readonly updatedAt: string;
};

const FILE_VERSION = 1;

export class RepoMetaCache {
  private memo = new Map<string, RepoMetaRecord>();
  private negative = new Map<string, number>();
  private inflight = new Map<string, Promise<unknown>>();
  private loaded = false;

  constructor(private readonly filePath: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const file = await readJson<RepoMetaFile>(this.filePath);
    if (!file || file.version !== FILE_VERSION) return;
    for (const [key, rec] of Object.entries(file.entries ?? {})) {
      this.memo.set(key, rec);
    }
  }

  async get(forge: string, owner: string, repo: string): Promise<RepoMetaRecord | null> {
    await this.ensureLoaded();
    const rec = this.memo.get(key(forge, owner, repo));
    if (!rec) return null;
    if (Date.now() - Date.parse(rec.fetchedAt) > REPO_META_TTL_MS) return null;
    return rec;
  }

  /** Return the cached latestTag if its independent TTL hasn't expired. */
  async getLatestTag(forge: string, owner: string, repo: string): Promise<string | null | undefined> {
    const rec = await this.get(forge, owner, repo);
    if (!rec?.latestTagFetchedAt) return undefined;
    if (Date.now() - Date.parse(rec.latestTagFetchedAt) > LATEST_TAG_TTL_MS) return undefined;
    return rec.latestTag;
  }

  async put(record: RepoMetaRecord): Promise<void> {
    await this.ensureLoaded();
    const k = key(record.forge, record.owner, record.repo);
    this.memo.set(k, record);
    await updateJson<RepoMetaFile>(this.filePath, (current) => {
      const existing = current?.version === FILE_VERSION ? (current.entries ?? {}) : {};
      return {
        version: FILE_VERSION,
        entries: { ...existing, [k]: record },
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /** Patch only the latestTag fields without touching other metadata. */
  async putLatestTag(forge: string, owner: string, repo: string, latestTag: string | null): Promise<void> {
    const existing = await this.get(forge, owner, repo);
    if (!existing) return;
    const next: RepoMetaRecord = {
      ...existing,
      latestTag,
      latestTagFetchedAt: new Date().toISOString(),
    };
    await this.put(next);
  }

  markMissing(forge: string, owner: string, repo: string, ref?: string): void {
    this.negative.set(negKey(forge, owner, repo, ref), Date.now());
  }

  isKnownMissing(forge: string, owner: string, repo: string, ref?: string): boolean {
    const k = negKey(forge, owner, repo, ref);
    const stamp = this.negative.get(k);
    if (stamp === undefined) return false;
    if (Date.now() - stamp > NEGATIVE_TTL_MS) {
      this.negative.delete(k);
      return false;
    }
    return true;
  }

  /**
   * Coalesce concurrent identical calls. Returns the in-flight promise if one
   * is already running for `key`, otherwise starts a new one and stores it.
   * The promise is removed once it settles, success or failure.
   */
  dedup<T>(callKey: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(callKey);
    if (existing) return existing as Promise<T>;
    const promise = fn().finally(() => {
      this.inflight.delete(callKey);
    });
    this.inflight.set(callKey, promise);
    return promise;
  }
}

function key(forge: string, owner: string, repo: string): string {
  return `${forge}:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function negKey(forge: string, owner: string, repo: string, ref?: string): string {
  return ref ? `${key(forge, owner, repo)}@${ref}` : key(forge, owner, repo);
}
