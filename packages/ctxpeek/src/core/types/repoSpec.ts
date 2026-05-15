export type Forge = "github" | "gitlab" | "bitbucket";

export type RepoSpec = {
  readonly forge: Forge;
  readonly owner: string;
  readonly repo: string;
  readonly ref: string | undefined;
  readonly subpath: string | undefined;
};

export type RepoSpecString = string & { readonly__brand: "RepoSpecString" };
