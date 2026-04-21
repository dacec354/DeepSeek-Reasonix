import { describe, expect, it } from "vitest";
import { AppendOnlyLog, ImmutablePrefix, VolatileScratch } from "../src/memory.js";

describe("ImmutablePrefix", () => {
  it("fingerprint is stable for identical inputs", () => {
    const a = new ImmutablePrefix({ system: "hello" });
    const b = new ImmutablePrefix({ system: "hello" });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("fingerprint changes with inputs", () => {
    const a = new ImmutablePrefix({ system: "hello" });
    const b = new ImmutablePrefix({ system: "world" });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("toMessages includes system plus few-shots", () => {
    const p = new ImmutablePrefix({
      system: "sys",
      fewShots: [{ role: "user", content: "hi" }],
    });
    expect(p.toMessages()).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
    ]);
  });
});

describe("AppendOnlyLog", () => {
  it("appends in order and rejects malformed entries", () => {
    const log = new AppendOnlyLog();
    log.append({ role: "user", content: "hi" });
    log.append({ role: "assistant", content: "hello" });
    expect(log.length).toBe(2);
    expect(() => log.append({ content: "x" } as any)).toThrow();
  });

  it("toMessages returns a shallow-copy not affecting internal state", () => {
    const log = new AppendOnlyLog();
    log.append({ role: "user", content: "hi" });
    const msgs = log.toMessages();
    msgs[0]!.content = "tampered";
    expect(log.entries[0]!.content).toBe("hi");
  });
});

describe("VolatileScratch", () => {
  it("resets all fields", () => {
    const s = new VolatileScratch();
    s.reasoning = "x";
    s.planState = { a: 1 };
    s.notes.push("note");
    s.reset();
    expect(s.reasoning).toBeNull();
    expect(s.planState).toBeNull();
    expect(s.notes).toEqual([]);
  });
});
