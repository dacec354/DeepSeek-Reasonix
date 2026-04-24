import { describe, expect, it } from "vitest";
import { clampBodyByLines } from "../src/cli/ui/PlanConfirm.js";

describe("clampBodyByLines", () => {
  it("returns text unchanged when already within the row budget", () => {
    const text = "line 1\nline 2\nline 3";
    expect(clampBodyByLines(text, 10)).toBe(text);
  });

  it("trims to the first N lines and appends a truncation marker", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
    const out = clampBodyByLines(lines.join("\n"), 10);
    expect(out.split("\n").slice(0, 10)).toEqual(lines.slice(0, 10));
    expect(out).toContain("30 more lines truncated");
  });

  it("shows the dropped-line count for the truncation hint", () => {
    const text = Array.from({ length: 25 }, (_, i) => `row${i}`).join("\n");
    expect(clampBodyByLines(text, 5)).toContain("20 more lines truncated");
  });

  it("handles an empty body without throwing", () => {
    expect(clampBodyByLines("", 5)).toBe("");
  });

  it("does not trim when exactly at the budget", () => {
    const text = "a\nb\nc";
    expect(clampBodyByLines(text, 3)).toBe(text);
  });
});
