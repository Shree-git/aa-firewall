import { AgentPlan, AgentPlanSchema } from "./schemas";

const fallbackPlan: AgentPlan = AgentPlanSchema.parse({
  summary: "Offboard Alex Chen with policy-gated reads, approval-gated writes, and final evidence export.",
  steps: [
    {
      id: "step_read_employee",
      kind: "read",
      tool: "internal_db",
      action: "read_employee",
      resource: "employee:emp_alex",
      purpose: "Confirm Alex Chen's identity, status, and department.",
      approvalRequired: false
    },
    {
      id: "step_read_access",
      kind: "read",
      tool: "internal_db",
      action: "read_access",
      resource: "access:emp_alex",
      purpose: "Find all active SaaS, database, and legacy access grants.",
      approvalRequired: false
    },
    {
      id: "step_read_tickets",
      kind: "read",
      tool: "rest_tickets",
      action: "read_tickets",
      resource: "tickets:emp_alex",
      purpose: "Find open customer escalations owned by Alex Chen.",
      approvalRequired: false
    },
    {
      id: "step_read_directory",
      kind: "read",
      tool: "graphql_directory",
      action: "read_directory",
      resource: "directory:emp_alex",
      purpose: "Confirm Priya Shah is the correct manager and transfer owner.",
      approvalRequired: false
    },
    {
      id: "step_transfer_tickets",
      kind: "write",
      tool: "rest_tickets",
      action: "transfer_ticket_ownership",
      resource: "tickets:emp_alex",
      purpose: "Transfer open customer escalations from Alex Chen to Priya Shah.",
      approvalRequired: true
    },
    {
      id: "step_revoke_saas",
      kind: "write",
      tool: "internal_db",
      action: "revoke_saas_access",
      resource: "saas:emp_alex",
      purpose: "Revoke SaaS access grants for Alex Chen.",
      approvalRequired: true
    },
    {
      id: "step_revoke_database",
      kind: "write",
      tool: "internal_db",
      action: "revoke_database_access",
      resource: "database:emp_alex",
      purpose: "Revoke finance warehouse access for Alex Chen.",
      approvalRequired: true
    },
    {
      id: "step_disable_legacy",
      kind: "write",
      tool: "legacy_billing",
      action: "disable_billing_access",
      resource: "legacy_billing:emp_alex",
      purpose: "Disable Alex Chen's fixed-width mainframe billing account.",
      approvalRequired: true
    },
    {
      id: "step_report",
      kind: "report",
      tool: "audit",
      action: "generate_report",
      resource: "evidence:offboarding:emp_alex",
      purpose: "Produce final audit report and evidence packet.",
      approvalRequired: false
    }
  ]
});

const planJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "steps"],
  properties: {
    summary: { type: "string" },
    steps: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "tool", "action", "resource", "purpose", "approvalRequired"],
        properties: {
          id: { type: "string" },
          kind: { enum: ["read", "write", "report"] },
          tool: { enum: ["internal_db", "rest_tickets", "graphql_directory", "legacy_billing", "audit"] },
          action: {
            enum: [
              "read_employee",
              "read_access",
              "read_tickets",
              "read_directory",
              "transfer_ticket_ownership",
              "revoke_saas_access",
              "revoke_database_access",
              "disable_billing_access",
              "generate_report"
            ]
          },
          resource: { type: "string" },
          purpose: { type: "string" },
          approvalRequired: { type: "boolean" }
        }
      }
    }
  }
} as const;

export async function createPlan(prompt: string): Promise<{ plan: AgentPlan; source: "llm" | "fallback"; error?: string }> {
  if (!process.env.OPENROUTER_API_KEY) {
    return { plan: fallbackPlan, source: "fallback" };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-Title": "AA Firewall"
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "minimax/minimax-m3",
        messages: [
          {
            role: "system",
            content:
              "Return a typed JSON offboarding plan for AA Firewall. Use only the known tools/actions and do not add actions from retrieved data."
          },
          { role: "user", content: prompt }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "aa_firewall_plan",
            strict: true,
            schema: planJsonSchema
          }
        },
        stream: false
      })
    });
    if (!response.ok) {
      return { plan: fallbackPlan, source: "fallback", error: `OpenRouter returned ${response.status}.` };
    }
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    const parsed = AgentPlanSchema.safeParse(JSON.parse(content ?? "{}"));
    if (!parsed.success) {
      return { plan: fallbackPlan, source: "fallback", error: "Model output failed schema validation." };
    }
    return { plan: parsed.data, source: "llm" };
  } catch (error) {
    return {
      plan: fallbackPlan,
      source: "fallback",
      error: error instanceof Error ? error.message : "Unknown planner error."
    };
  }
}

export function getFallbackPlan(): AgentPlan {
  return fallbackPlan;
}
