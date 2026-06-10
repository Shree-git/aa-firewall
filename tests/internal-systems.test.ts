import { beforeEach, describe, expect, it } from "vitest";
import { GET as accessGet } from "@/app/api/internal/db/access/route";
import { POST as probePost } from "@/app/api/internal/capability/probe/route";
import { POST as graphqlPost } from "@/app/api/internal/graphql/directory/route";
import { POST as transferPost } from "@/app/api/internal/rest/tickets/transfer/route";
import { GET as ticketsGet } from "@/app/api/internal/rest/tickets/route";
import { getInternalSystemSnapshot } from "@/server/internal-systems";
import { Capability } from "@/server/schemas";
import { DEMO_SESSION_COOKIE, mintDemoSession } from "@/server/session";
import { makeAuditActor } from "@/server/security";
import { DEFAULT_PROMPT, approveRun, resetDemo, startRun } from "@/server/workflow";

describe("internal protocol systems", () => {
  const actor = makeAuditActor("it_admin");

  beforeEach(() => {
    resetDemo();
  });

  it("gates REST endpoints with missing, read, wrong-scope, and write capabilities", async () => {
    let snapshot = await startRun({ prompt: DEFAULT_PROMPT, scenario: "happy_path" }, actor);
    const readTickets = findCapability(snapshot.capabilities, "rest_tickets", "read_tickets");

    const missing = await ticketsGet(new Request("http://localhost/api/internal/rest/tickets?owner=emp_alex"));
    expect(missing.status).toBe(401);

    const readable = await ticketsGet(
      new Request("http://localhost/api/internal/rest/tickets?owner=emp_alex", { headers: { authorization: `Bearer ${readTickets.id}` } })
    );
    expect(readable.status).toBe(200);
    await expect(readable.json()).resolves.toMatchObject({ tickets: expect.any(Array) });

    const wrongScope = await transferPost(
      new Request("http://localhost/api/internal/rest/tickets/transfer", {
        method: "POST",
        headers: { authorization: `Bearer ${readTickets.id}`, "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: "emp_alex", transferOwnerId: "emp_priya", dryRun: true, runId: snapshot.runId })
      })
    );
    expect(wrongScope.status).toBe(403);

    snapshot = approveRun(snapshot.runId!, actor);
    const writeTickets = findCapability(snapshot.capabilities, "rest_tickets", "transfer_ticket_ownership");
    const writable = await transferPost(
      new Request("http://localhost/api/internal/rest/tickets/transfer", {
        method: "POST",
        headers: { authorization: `Bearer ${writeTickets.id}`, "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: "emp_alex", transferOwnerId: "emp_priya", dryRun: true, runId: snapshot.runId })
      })
    );
    expect(writable.status).toBe(200);
  });

  it("executes a real GraphQL directory schema and rejects invalid queries", async () => {
    const snapshot = await startRun({ prompt: DEFAULT_PROMPT, scenario: "happy_path" }, actor);
    const directory = findCapability(snapshot.capabilities, "graphql_directory", "read_directory");
    const valid = await graphqlPost(
      new Request("http://localhost/api/internal/graphql/directory", {
        method: "POST",
        headers: { authorization: `Bearer ${directory.id}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: snapshot.runId,
          query: "query EmployeeManager($id: String!) { employee(id: $id) { id manager { id name } } }",
          variables: { id: "emp_alex" }
        })
      })
    );
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toMatchObject({ data: { employee: { manager: { name: "Priya Shah" } } } });

    const invalid = await graphqlPost(
      new Request("http://localhost/api/internal/graphql/directory", {
        method: "POST",
        headers: { authorization: `Bearer ${directory.id}`, "Content-Type": "application/json" },
        body: JSON.stringify({ runId: snapshot.runId, query: "{ employee(id: \"emp_alex\") { missingField } }", variables: { id: "emp_alex" } })
      })
    );
    expect(invalid.status).toBe(400);
  });

  it("exports live snapshots with redacted protocol frames and fixed-width billing state", async () => {
    let snapshot = await startRun({ prompt: DEFAULT_PROMPT, scenario: "happy_path" }, actor);
    let systems = getInternalSystemSnapshot(snapshot.runId);
    expect(systems.accessGrants.some((grant) => grant.status === "active")).toBe(true);
    expect(systems.protocolFrames.some((frame) => frame.path.includes("/api/internal/rest/tickets"))).toBe(true);

    snapshot = approveRun(snapshot.runId!, actor);
    systems = getInternalSystemSnapshot(snapshot.runId);
    expect(systems.accessGrants.every((grant) => grant.status === "revoked")).toBe(true);
    expect(systems.tickets.every((ticket) => ticket.owner_id === "emp_priya")).toBe(true);
    expect(systems.legacyBilling).toMatchObject({ parsed: { accountCode: "[redacted]", status: "disabled" } });
    expect(String((systems.legacyBilling as { rawRecord: string }).rawRecord)).toContain("disabled");
    expect(JSON.stringify(systems.protocolFrames)).not.toContain("alex.chen@contoso.internal");
    expect(JSON.stringify(systems.protocolFrames)).not.toContain("BILL-ALEX-0042");
  });

  it("stores capability probe results for 401, 403, and 200 checks", async () => {
    let snapshot = await startRun({ prompt: DEFAULT_PROMPT, scenario: "happy_path" }, actor);
    snapshot = approveRun(snapshot.runId!, actor);
    const cookie = `${DEMO_SESSION_COOKIE}=${encodeURIComponent(mintDemoSession("it_admin"))}`;
    const response = await probePost(
      new Request("http://localhost/api/internal/capability/probe", {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ runId: snapshot.runId })
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results.map((result: { statusCode: number }) => result.statusCode)).toEqual([401, 403, 200]);
    expect(body.snapshot.capabilityProbeResults.every((result: { passed: boolean }) => result.passed)).toBe(true);
  });

  it("keeps read tokens from mutating access resources", async () => {
    const snapshot = await startRun({ prompt: DEFAULT_PROMPT, scenario: "happy_path" }, actor);
    const readAccess = findCapability(snapshot.capabilities, "internal_db", "read_access");
    const response = await accessGet(
      new Request("http://localhost/api/internal/db/access?employeeId=emp_alex", { headers: { authorization: `Bearer ${readAccess.id}` } })
    );
    expect(response.status).toBe(200);
    expect(getInternalSystemSnapshot(snapshot.runId).accessGrants.some((grant) => grant.status === "active")).toBe(true);
  });
});

function findCapability(capabilities: Capability[], tool: Capability["tool"], action: Capability["action"]): Capability {
  const capability = capabilities.find((item) => item.tool === tool && item.action === action);
  if (!capability) throw new Error(`Missing capability ${tool}:${action}`);
  return capability;
}
