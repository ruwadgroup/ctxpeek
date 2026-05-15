export function leafName(name: string): string {
  return name.split("/").filter(Boolean).pop() ?? name;
}

export function namesEqual(a: string | undefined, b: string | undefined): boolean {
  return Boolean(a && b && normalizeName(a) === normalizeName(b));
}

export function packagePathName(packageName: string): string {
  return leafName(packageName).replace(/^@/, "");
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[\s._-]/g, "");
}
