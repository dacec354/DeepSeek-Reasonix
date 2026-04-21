import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools.js";

describe("ToolRegistry", () => {
  it("registers and dispatches a tool with JSON args", async () => {
    const reg = new ToolRegistry();
    reg.register<{ a: number; b: number }, number>({
      name: "add",
      description: "add two ints",
      parameters: {
        type: "object",
        properties: { a: { type: "integer" }, b: { type: "integer" } },
        required: ["a", "b"],
      },
      fn: ({ a, b }) => a + b,
    });
    expect(reg.has("add")).toBe(true);
    const result = await reg.dispatch("add", '{"a":2,"b":3}');
    expect(result).toBe("5");
  });

  it("returns structured error for unknown tool", async () => {
    const reg = new ToolRegistry();
    const out = await reg.dispatch("nope", "{}");
    expect(JSON.parse(out)).toEqual({ error: "unknown tool: nope" });
  });

  it("handles invalid JSON arguments gracefully", async () => {
    const reg = new ToolRegistry();
    reg.register({ name: "noop", fn: () => "ok" });
    const out = await reg.dispatch("noop", "{bad json");
    expect(JSON.parse(out).error).toMatch(/invalid tool arguments JSON/);
  });

  it("emits OpenAI-shaped specs", () => {
    const reg = new ToolRegistry();
    reg.register({
      name: "echo",
      description: "echo input",
      parameters: {
        type: "object",
        properties: { msg: { type: "string" } },
        required: ["msg"],
      },
      fn: ({ msg }: { msg: string }) => msg,
    });
    const spec = reg.specs()[0]!;
    expect(spec.type).toBe("function");
    expect(spec.function.name).toBe("echo");
    expect(spec.function.parameters.required).toEqual(["msg"]);
  });
});
