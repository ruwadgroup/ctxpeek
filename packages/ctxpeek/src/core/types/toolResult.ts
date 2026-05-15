export type ToolResult<S = unknown> = {
  readonly content: ReadonlyArray<{ type: "text"; text: string }>;
  readonly structuredContent?: S;
  readonly isError?: boolean;
};
