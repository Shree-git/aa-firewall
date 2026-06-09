import { z } from "zod";

export const ActorRoleSchema = z.enum(["it_admin", "manager", "employee", "security_auditor"]);
export type ActorRole = z.infer<typeof ActorRoleSchema>;

export const RunStateSchema = z.enum([
  "created",
  "planning",
  "awaiting_approval",
  "executing",
  "paused",
  "retrying",
  "completed",
  "blocked",
  "denied",
  "cancelled"
]);
export type RunState = z.infer<typeof RunStateSchema>;

export const ActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: ActorRoleSchema
});
export type Actor = z.infer<typeof ActorSchema>;

export const StepKindSchema = z.enum(["read", "write", "report"]);
export const ToolNameSchema = z.enum(["internal_db", "rest_tickets", "graphql_directory", "legacy_billing", "audit"]);
export const ToolActionSchema = z.enum([
  "read_employee",
  "read_access",
  "read_tickets",
  "read_directory",
  "transfer_ticket_ownership",
  "revoke_saas_access",
  "revoke_database_access",
  "disable_billing_access",
  "generate_report"
]);

export const PlanStepSchema = z.object({
  id: z.string(),
  kind: StepKindSchema,
  tool: ToolNameSchema,
  action: ToolActionSchema,
  resource: z.string(),
  purpose: z.string(),
  approvalRequired: z.boolean()
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const AgentPlanSchema = z.object({
  summary: z.string(),
  steps: z.array(PlanStepSchema).min(1)
});
export type AgentPlan = z.infer<typeof AgentPlanSchema>;

export const CapabilitySchema = z.object({
  id: z.string(),
  runId: z.string(),
  tool: ToolNameSchema,
  action: ToolActionSchema,
  resource: z.string(),
  scope: z.enum(["read", "write"]),
  actorId: z.string(),
  expiresAt: z.string(),
  approvalId: z.string().optional(),
  signature: z.string()
});
export type Capability = z.infer<typeof CapabilitySchema>;

export const ToolCallSchema = z.object({
  runId: z.string(),
  tool: ToolNameSchema,
  action: ToolActionSchema,
  input: z.record(z.unknown()),
  capability: CapabilitySchema,
  idempotencyKey: z.string(),
  purpose: z.string()
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const PolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  requiresApproval: z.boolean().default(false)
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const AuditEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  sequence: z.number().int().nonnegative(),
  type: z.string(),
  actorId: z.string(),
  tool: ToolNameSchema.optional(),
  action: ToolActionSchema.optional(),
  resource: z.string().optional(),
  decision: z.enum(["allow", "deny", "pending"]).optional(),
  payloadRedacted: z.unknown(),
  resultDigest: z.string().optional(),
  idempotencyKey: z.string().optional(),
  prevHash: z.string(),
  hash: z.string(),
  createdAt: z.string()
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stepId: z.string(),
  actorId: z.string(),
  status: z.enum(["pending", "approved", "denied"]),
  createdAt: z.string(),
  decidedAt: z.string().optional()
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const ConnectorActivitySchema = z.object({
  id: z.string(),
  stepId: z.string(),
  tool: ToolNameSchema,
  action: ToolActionSchema,
  status: z.enum(["pending", "success", "failed", "blocked"]),
  message: z.string(),
  createdAt: z.string()
});
export type ConnectorActivity = z.infer<typeof ConnectorActivitySchema>;

export const EvidencePacketSchema = z.object({
  runSummary: z.record(z.unknown()),
  prompt: z.string(),
  actor: ActorSchema,
  plan: AgentPlanSchema,
  approvals: z.array(ApprovalSchema),
  policyDecisions: z.array(PolicyDecisionSchema),
  capabilities: z.array(CapabilitySchema),
  toolCalls: z.array(ToolCallSchema),
  stateDiffs: z.array(z.record(z.unknown())),
  auditRootHash: z.string(),
  generatedAt: z.string()
});
export type EvidencePacket = z.infer<typeof EvidencePacketSchema>;

export const StartRunInputSchema = z.object({
  prompt: z.string().min(5),
  actorRole: ActorRoleSchema,
  scenario: z.enum(["happy_path", "rest_failure", "prompt_injection"]).default("happy_path")
});
export type StartRunInput = z.infer<typeof StartRunInputSchema>;

export const DemoSnapshotSchema = z.object({
  runId: z.string().nullable(),
  state: RunStateSchema.nullable(),
  actor: ActorSchema.nullable(),
  prompt: z.string(),
  scenario: z.string(),
  plan: AgentPlanSchema.nullable(),
  approvals: z.array(ApprovalSchema),
  connectorActivity: z.array(ConnectorActivitySchema),
  auditEvents: z.array(AuditEventSchema),
  finalReport: z.string().nullable(),
  evidence: EvidencePacketSchema.nullable(),
  blockedReason: z.string().nullable()
});
export type DemoSnapshot = z.infer<typeof DemoSnapshotSchema>;
