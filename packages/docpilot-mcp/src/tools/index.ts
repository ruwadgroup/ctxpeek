/**
 * Tool registry. The server constructs each tool with its dependencies
 * (fetch strategy, cache, indexer) and registers them with McpServer.
 *
 * See design doc §8 for the final tool surface.
 */
export * from "./resolve_repo.js";
export * from "./list_docs.js";
export * from "./fetch_doc.js";
export * from "./search_docs.js";
export * from "./peek.js";
export * from "./get_changes.js";
export * from "./doc_quality.js";
export * from "./cache_status.js";
