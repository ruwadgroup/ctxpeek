/**
 * Content-addressed blob store.
 *
 *   ${env-paths('docpilot').cache}/blobs/{ab}/{ab12cdef…}
 *
 * Two refs that share a file share storage. A new release of a 50 MB
 * repo costs only the diff. Every cached byte is verifiable against
 * its sha256.
 *
 * See design doc §9.1 / §9.4.
 */
export interface BlobStore {
  has(sha256: string): Promise<boolean>;
  read(sha256: string): Promise<Uint8Array>;
  write(sha256: string, bytes: Uint8Array): Promise<void>;
  size(): Promise<number>;
}

export function createBlobStore(_dir: string): BlobStore {
  // TODO(v0.1, day-2): proper-lockfile single-writer per snapshot, lock-free reads
  throw new Error("not implemented");
}
