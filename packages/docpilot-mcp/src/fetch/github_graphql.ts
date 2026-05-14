/**
 * GitHub GraphQL client.
 *
 * Used for alias-batched blob fetches when ≥4 files are needed cold.
 * GraphQL has no ETag support, so this is the wrong tool for repeated
 * fetches; on a fresh batch it costs ~1–3 points vs N REST requests.
 *
 * See design doc §4.2 step 4 for the batch query shape.
 */
export class GithubGraphqlClient {
  // TODO(v0.2, week-4): batched DocBatch query, rateLimit awareness
}
