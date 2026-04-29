import { describe, expect, it } from "vitest";
import { chromeFrame } from "../src/cli/ui/chrome-frame.js";
import type { Frame } from "../src/frame/index.js";
import { rowText } from "../src/frame/index.js";
import type { SessionSummary } from "../src/telemetry.js";

const baseSummary: SessionSummary = {
  turns: 0,
  totalCostUsd: 0,
  lastTurnCostUsd: 0,
  totalInputCostUsd: 0,
  totalOutputCostUsd: 0,
  cacheHitRatio: 0,
  lastPromptTokens: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  iterations: 0,
  toolCalls: 0,
};

function assertWidth(f: Frame, width: number): void {
  expect(f.width).toBe(width);
  for (const r of f.rows) {
    let visual = 0;
    for (const c of r) if (!c.tail) visual += c.width;
    expect(visual).toBe(width);
  }
}

describe("chromeFrame", () => {
  it("renders a single row when no budget set", () => {
    const f = chromeFrame({ summary: baseSummary, width: 80 });
    // chrome row + rule = 2 rows
    expect(f.rows.length).toBe(2);
    assertWidth(f, 80);
  });

  it("includes brand wordmark on the left", () => {
    const f = chromeFrame({ summary: baseSummary, width: 80 });
    const firstRow = rowText(f.rows[0]!);
    expect(firstRow).toContain("◈");
    expect(firstRow).toContain("reasonix");
  });

  it("includes project crumb when rootDir set", () => {
    const f = chromeFrame({
      summary: baseSummary,
      width: 120,
      rootDir: "/path/to/myproject",
      sessionName: "code-x",
    });
    const firstRow = rowText(f.rows[0]!);
    expect(firstRow).toContain("myproject");
    expect(firstRow).toContain("code-x");
  });

  it("drops session crumb on narrow width", () => {
    const f = chromeFrame({
      summary: baseSummary,
      width: 80, // narrow
      rootDir: "/path/myproject",
      sessionName: "code-x",
    });
    const firstRow = rowText(f.rows[0]!);
    expect(firstRow).toContain("myproject");
    expect(firstRow).not.toContain("code-x");
  });

  it("renders cost pill always", () => {
    const f = chromeFrame({ summary: { ...baseSummary, totalCostUsd: 0.0123 }, width: 120 });
    const firstRow = rowText(f.rows[0]!);
    expect(firstRow).toContain("$0.0123");
  });

  it("renders mode pill when in plan mode", () => {
    const f = chromeFrame({ summary: baseSummary, width: 120, planMode: true });
    expect(rowText(f.rows[0]!)).toContain("[PLAN]");
  });

  it("renders edit-mode pill", () => {
    const f = chromeFrame({ summary: baseSummary, width: 120, editMode: "yolo" });
    expect(rowText(f.rows[0]!)).toContain("[yolo]");
  });

  it("renders pro pill when armed or escalated", () => {
    const armed = chromeFrame({ summary: baseSummary, width: 120, proArmed: true });
    expect(rowText(armed.rows[0]!)).toContain("⇧ pro");
    const esc = chromeFrame({ summary: baseSummary, width: 120, escalated: true });
    expect(rowText(esc.rows[0]!)).toContain("⇧ pro");
  });

  it("renders update pill when updateAvailable", () => {
    const f = chromeFrame({ summary: baseSummary, width: 120, updateAvailable: "0.14.0" });
    expect(rowText(f.rows[0]!)).toContain("↑ 0.14.0");
  });

  it("renders balance pill when set + non-narrow", () => {
    const f = chromeFrame({
      summary: baseSummary,
      width: 120,
      balance: { currency: "USD", total: 12.5 },
    });
    expect(rowText(f.rows[0]!)).toContain("$12.50");
  });

  it("hides cache bar in cold-start (turns ≤ 3)", () => {
    const f = chromeFrame({
      summary: { ...baseSummary, turns: 1, cacheHitRatio: 0.7 },
      width: 120,
    });
    expect(rowText(f.rows[0]!)).not.toContain("█"); // no bar yet
  });

  it("renders cache bar after warm-up turns", () => {
    const f = chromeFrame({
      summary: { ...baseSummary, turns: 5, cacheHitRatio: 0.6 },
      width: 120,
    });
    const row = rowText(f.rows[0]!);
    expect(row).toContain("█"); // bar present
    expect(row).toContain("60%");
  });

  it("emits horizontal rule under chrome row", () => {
    const f = chromeFrame({ summary: baseSummary, width: 80 });
    const rule = rowText(f.rows[1]!);
    expect(rule).toContain("─");
  });

  it("includes budget row when budgetUsd is set", () => {
    const f = chromeFrame({
      summary: { ...baseSummary, totalCostUsd: 1.0 },
      width: 80,
      budgetUsd: 5.0,
    });
    expect(f.rows.length).toBe(3); // chrome + rule + budget
    expect(rowText(f.rows[2]!)).toContain("budget");
    expect(rowText(f.rows[2]!)).toContain("$1.0000");
    expect(rowText(f.rows[2]!)).toContain("$5.00");
  });

  it("preserves row-width invariant under all configurations", () => {
    for (const cfg of [
      { width: 80 },
      { width: 120, rootDir: "/p", sessionName: "s" },
      { width: 80, planMode: true, proArmed: true, updateAvailable: "1.0" },
      {
        width: 200,
        rootDir: "/p",
        sessionName: "s",
        balance: { currency: "USD" as const, total: 5.0 },
        budgetUsd: 10.0,
      },
    ]) {
      const f = chromeFrame({ summary: baseSummary, ...cfg });
      assertWidth(f, cfg.width);
    }
  });
});
