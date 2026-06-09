import crypto from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function digest(value: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, sortValue(val)])
    );
  }
  return value;
}
