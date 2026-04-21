import { describe, expect, it } from "vitest";
import { StormBreaker } from "../../src/repair/storm.js";
import type { ToolCall } from "../../src/types.js";

function call(name: string, args: string): ToolCall {
  return { function: { name, arguments: args } };
}

describe("StormBreaker", () => {
  it("passes through below threshold", () => {
    const sb = new StormBreaker(6, 3);
    expect(sb.inspect(call("x", "{}")).suppress).toBe(false);
    expect(sb.inspect(call("x", "{}")).suppress).toBe(false);
  });

  it("suppresses on threshold reached", () => {
    const sb = new StormBreaker(6, 3);
    sb.inspect(call("x", "{}"));
    sb.inspect(call("x", "{}"));
    const verdict = sb.inspect(call("x", "{}"));
    expect(verdict.suppress).toBe(true);
    expect(verdict.reason).toMatch(/call-storm/);
  });

  it("distinguishes different args as different calls", () => {
    const sb = new StormBreaker(6, 3);
    sb.inspect(call("x", '{"a":1}'));
    sb.inspect(call("x", '{"a":2}'));
    sb.inspect(call("x", '{"a":3}'));
    // different args each time — not a storm
    const verdict = sb.inspect(call("x", '{"a":4}'));
    expect(verdict.suppress).toBe(false);
  });

  it("forgets old calls beyond window", () => {
    const sb = new StormBreaker(3, 3);
    sb.inspect(call("x", "{}"));
    sb.inspect(call("x", "{}"));
    sb.inspect(call("y", "{}"));
    sb.inspect(call("z", "{}"));
    sb.inspect(call("w", "{}"));
    // only the most recent 3 are in the window now, none of which is "x",
    // so a single new "x" should not suppress.
    expect(sb.inspect(call("x", "{}")).suppress).toBe(false);
  });
});
