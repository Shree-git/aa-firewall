import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlan, getFallbackPlan } from "@/server/planner";

describe("OpenRouter planner", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalModel = process.env.OPENROUTER_MODEL;
  const originalFetch = global.fetch;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalModel;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("falls back deterministically without an OpenRouter key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const result = await createPlan("offboard alex chen");
    expect(result).toMatchObject({ source: "fallback", plan: getFallbackPlan() });
  });

  it("uses OpenRouter chat completions with structured output", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("minimax/minimax-m3");
      expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "aa_firewall_plan", strict: true } });
      return Response.json({ choices: [{ message: { content: JSON.stringify(getFallbackPlan()) } }] });
    }) as typeof fetch;

    const result = await createPlan("offboard alex chen");
    expect(result.source).toBe("llm");
  });

  it("falls back on malformed JSON and schema failure", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    global.fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: "not-json" } }] })) as typeof fetch;
    expect(await createPlan("offboard alex chen")).toMatchObject({ source: "fallback" });

    global.fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ summary: "bad", steps: [] }) } }] })) as typeof fetch;
    expect(await createPlan("offboard alex chen")).toMatchObject({ source: "fallback", error: "Model output failed schema validation." });
  });
});
