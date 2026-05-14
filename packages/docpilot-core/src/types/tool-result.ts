/**
 * MCP-shaped tool result with markdown text content. Tools may optionally
 * attach `structuredContent` when an `outputSchema` makes the result
 * programmatically useful (see §6.3 of the design doc).
 */
export interface ToolResult<S = unknown> {
  readonly content: ReadonlyArray<{ type: "text"; text: string }>;
  readonly structuredContent?: S;
  readonly isError?: boolean;
}
