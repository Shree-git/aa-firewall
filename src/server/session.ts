import crypto from "node:crypto";
import { Actor, ActorRole, ActorRoleSchema } from "./schemas";
import { canonicalJson } from "./id";
import { HttpError } from "./http";
import { makeAuditActor } from "./security";

export const DEMO_SESSION_COOKIE = "aa_firewall_demo_session";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessionSecret = process.env.SESSION_SECRET ?? process.env.CAPABILITY_SECRET ?? "aa-firewall-demo-session-secret";

type SessionPayload = {
  role: ActorRole;
  issuedAt: string;
  expiresAt: string;
};

export function mintDemoSession(role: ActorRole, now = Date.now()): string {
  const payload: SessionPayload = {
    role: ActorRoleSchema.parse(role),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };
  const payloadEncoded = Buffer.from(canonicalJson(payload), "utf8").toString("base64url");
  return `${payloadEncoded}.${sign(payloadEncoded)}`;
}

export function verifyDemoSession(token: string | undefined, now = Date.now()): { ok: true; actor: Actor } | { ok: false; reason: string } {
  if (!token) return { ok: false, reason: "Missing signed demo session." };
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return { ok: false, reason: "Malformed signed demo session." };

  const expected = sign(payloadEncoded);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return { ok: false, reason: "Signed demo session was tampered." };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf8")) as SessionPayload;
    const role = ActorRoleSchema.parse(payload.role);
    if (Date.parse(payload.expiresAt) <= now) return { ok: false, reason: "Signed demo session expired." };
    return { ok: true, actor: makeAuditActor(role) };
  } catch {
    return { ok: false, reason: "Signed demo session payload is invalid." };
  }
}

export function requireDemoSession(request: Request): Actor {
  const token = readCookie(request, DEMO_SESSION_COOKIE);
  const verified = verifyDemoSession(token);
  if (!verified.ok) throw new HttpError(401, "SESSION_INVALID", verified.reason);
  return verified.actor;
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const cookie of header.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

function sign(payloadEncoded: string): string {
  return crypto.createHmac("sha256", sessionSecret).update(payloadEncoded).digest("hex");
}
