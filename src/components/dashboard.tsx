"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileClock,
  Play,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Terminal,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ActorRole, DemoSnapshot } from "@/server/schemas";

const defaultPrompt =
  "Offboard Alex Chen effective today: find all systems Alex has access to, check open customer escalations, transfer ownership to Priya Shah, revoke SaaS and database access, disable legacy billing access, and produce an audit report.";

type Scenario = "happy_path" | "rest_failure" | "prompt_injection";

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [actorRole, setActorRole] = useState<ActorRole>("it_admin");
  const [scenario, setScenario] = useState<Scenario>("happy_path");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  const pendingApprovals = snapshot?.approvals.filter((approval) => approval.status === "pending") ?? [];
  const evidencePreview = useMemo(() => {
    if (!snapshot?.evidence) return "";
    return JSON.stringify(snapshot.evidence, null, 2);
  }, [snapshot?.evidence]);

  async function refresh() {
    const response = await fetch("/api/demo");
    setSnapshot(await response.json());
  }

  async function call<T>(fn: () => Promise<T>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    await call(async () => {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, actorRole, scenario })
      });
      setSnapshot(await response.json());
    });
  }

  async function approve(allow = true) {
    if (!snapshot?.runId) return;
    await call(async () => {
      const response = await fetch(`/api/runs/${snapshot.runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve: allow })
      });
      setSnapshot(await response.json());
    });
  }

  async function retry() {
    if (!snapshot?.runId) return;
    await call(async () => {
      const response = await fetch(`/api/runs/${snapshot.runId}/retry`, { method: "POST" });
      setSnapshot(await response.json());
    });
  }

  async function reset() {
    await call(async () => {
      const response = await fetch("/api/demo", { method: "DELETE" });
      setSnapshot(await response.json());
    });
  }

  function downloadEvidence() {
    if (!snapshot?.evidence) return;
    const blob = new Blob([JSON.stringify(snapshot.evidence, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aa-firewall-evidence-${snapshot.runId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">AA</div>
          <div>
            <h1>AA Firewall</h1>
            <p>Secure agent execution layer</p>
          </div>
        </div>

        <div className="side-panel">
          <div className="label">Actor</div>
          <select className="select" value={actorRole} onChange={(event) => setActorRole(event.target.value as ActorRole)}>
            <option value="it_admin">IT Admin: Jordan Lee</option>
            <option value="manager">Manager: Priya Shah</option>
            <option value="employee">Employee: Alex Chen</option>
            <option value="security_auditor">Security Auditor: Morgan Patel</option>
          </select>
        </div>

        <div className="side-panel">
          <div className="label">Scenario</div>
          <select className="select" value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}>
            <option value="happy_path">Happy path</option>
            <option value="rest_failure">REST timeout after write</option>
            <option value="prompt_injection">Prompt-injection fixture</option>
          </select>
        </div>

        <button className="button button-primary" disabled={busy} onClick={start}>
          <Play size={16} /> Start workflow
        </button>
        <button className="button button-secondary" disabled={busy} onClick={reset}>
          <RotateCcw size={16} /> Reset seed state
        </button>

        <div className="side-panel">
          <div className="label">Current run</div>
          <p className="small">State: {snapshot?.state ?? "idle"}</p>
          <p className="small">Run: {snapshot?.runId ?? "none"}</p>
          <p className="small">Actor: {snapshot?.actor?.role ?? "not selected"}</p>
        </div>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <h2>Employee offboarding control plane</h2>
            <div className="small">Policy-gated agent actions across DB, REST, GraphQL, and legacy systems.</div>
          </div>
          <div className="status-strip">
            <span className="pill">RBAC simulated</span>
            <span className="pill">HMAC capabilities</span>
            <span className="pill">Chain-hashed audit</span>
          </div>
        </div>

        <div className="grid">
          <div className="stack">
            <Panel title="Natural-language task" icon={<Terminal size={16} />}>
              <textarea className="textarea" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              <div className="actions-row">
                <button className="button button-primary" disabled={busy} onClick={start}>
                  <Play size={16} /> Generate plan
                </button>
                {snapshot?.state === "paused" ? (
                  <button className="button button-secondary" disabled={busy} onClick={retry}>
                    <RefreshCcw size={16} /> Retry paused step
                  </button>
                ) : null}
              </div>
            </Panel>

            <Panel title="Generated plan" icon={<FileClock size={16} />}>
              {snapshot?.plan ? (
                <div className="plan-list">
                  {snapshot.plan.steps.map((step, index) => (
                    <div className="plan-step" key={step.id}>
                      <div className="step-index">{index + 1}</div>
                      <div>
                        <p className="step-title">{step.action.replaceAll("_", " ")}</p>
                        <div className="step-purpose">{step.purpose}</div>
                        <div className="small">
                          {step.tool} · {step.resource}
                        </div>
                      </div>
                      <span className={`tag ${step.kind === "write" ? "tag-write" : "tag-read"}`}>{step.kind}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">Start a workflow to see the typed plan.</div>
              )}
            </Panel>
          </div>

          <div className="stack">
            <Panel title="Approval queue" icon={<ShieldCheck size={16} />}>
              {pendingApprovals.length > 0 ? (
                <div className="stack">
                  {pendingApprovals.map((approval) => (
                    <div className="approval" key={approval.id}>
                      <div>
                        <p className="step-title">{approval.stepId.replaceAll("_", " ")}</p>
                        <div className="small">Write capability mints only after approval.</div>
                      </div>
                      <div className="actions-row">
                        <button className="button button-primary" disabled={busy} onClick={() => approve(true)}>
                          <CheckCircle2 size={16} /> Approve
                        </button>
                        <button className="button button-danger" disabled={busy} onClick={() => approve(false)}>
                          <XCircle size={16} /> Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">No pending approvals.</div>
              )}
              {snapshot?.blockedReason ? (
                <div className="approval" style={{ marginTop: 12 }}>
                  <AlertTriangle size={18} color="#ba3b46" />
                  <div>
                    <p className="step-title">Policy block</p>
                    <div className="small">{snapshot.blockedReason}</div>
                  </div>
                </div>
              ) : null}
            </Panel>

            <Panel title="Connector activity" icon={<RefreshCcw size={16} />}>
              {snapshot?.connectorActivity.length ? (
                <div className="activity-list">
                  {snapshot.connectorActivity.map((activity) => (
                    <div className="activity" key={activity.id}>
                      <span className={`tag tag-${activity.status}`}>{activity.status}</span>
                      <p className="step-title">{activity.action.replaceAll("_", " ")}</p>
                      <div className="small">
                        {activity.tool} · {activity.message}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">Connector calls appear after plan execution.</div>
              )}
            </Panel>
          </div>
        </div>

        <div className="grid">
          <Panel title="Audit replay" icon={<ShieldCheck size={16} />}>
            {snapshot?.auditEvents.length ? (
              <div className="audit-list">
                {snapshot.auditEvents.map((event) => (
                  <div className="audit-event" key={event.id}>
                    <span className={`tag ${event.decision === "deny" ? "tag-denied" : "tag-read"}`}>#{event.sequence} {event.type}</span>
                    <div className="small">
                      {event.tool ?? "system"} {event.action ? `· ${event.action}` : ""} {event.idempotencyKey ? `· ${event.idempotencyKey}` : ""}
                    </div>
                    <span className="hash">hash {event.hash}</span>
                    <span className="hash">prev {event.prevHash}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Audit events are chain-hashed as the workflow runs.</div>
            )}
          </Panel>

          <Panel title="Reviewer evidence packet" icon={<Download size={16} />}>
            <div className="actions-row" style={{ marginTop: 0, marginBottom: 12 }}>
              <button className="button button-secondary" disabled={!snapshot?.evidence} onClick={downloadEvidence}>
                <Download size={16} /> Export JSON
              </button>
              <span className={`tag tag-${snapshot?.state ?? "idle"}`}>{snapshot?.state ?? "idle"}</span>
            </div>
            {evidencePreview ? <pre className="evidence-box">{evidencePreview}</pre> : <div className="empty">Evidence packet appears after a terminal or paused run.</div>}
          </Panel>
        </div>
      </section>
    </main>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h3>{title}</h3>
        {icon}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}
