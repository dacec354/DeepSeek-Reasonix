/**
 * Tests for the `run_skill` tool. Uses a temp `homeDir` and optional
 * `projectRoot` so the tool never reads real skill dirs.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ToolRegistry } from "../src/tools.js";
import { registerSkillTools } from "../src/tools/skills.js";

/**
 * Write a skill under `<baseDir>/.reasonix/skills/<name>/SKILL.md`.
 * Callers pass their home tmpdir for global-scope skills, or their
 * projectRoot tmpdir for project-scope skills — the on-disk layout is
 * the same either way, only the base directory differs.
 */
function writeSkill(baseDir: string, name: string, description: string, body: string): void {
  const dir = join(baseDir, ".reasonix", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`,
    "utf8",
  );
}

describe("run_skill tool", () => {
  let home: string;
  let projectRoot: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "reasonix-skilltool-"));
    projectRoot = mkdtempSync(join(tmpdir(), "reasonix-skilltool-proj-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("registers run_skill as a read-only tool", () => {
    const reg = new ToolRegistry();
    registerSkillTools(reg, { homeDir: home });
    const tool = reg.get("run_skill");
    expect(tool).toBeDefined();
    expect(tool?.readOnly).toBe(true);
  });

  it("returns the skill body when the name resolves (global scope)", async () => {
    writeSkill(home, "review", "Review a PR", "Step 1: diff. Step 2: comment.");
    const reg = new ToolRegistry();
    registerSkillTools(reg, { homeDir: home });
    const out = await reg.dispatch("run_skill", { name: "review" });
    expect(out).toContain("# Skill: review");
    expect(out).toContain("Review a PR");
    expect(out).toContain("scope: global");
    expect(out).toContain("Step 1: diff");
  });

  it("resolves project-scope skills when projectRoot is passed", async () => {
    writeSkill(projectRoot, "deploy", "Deploy to staging", "Run pipeline.");
    const reg = new ToolRegistry();
    registerSkillTools(reg, { homeDir: home, projectRoot });
    const out = await reg.dispatch("run_skill", { name: "deploy" });
    expect(out).toContain("scope: project");
    expect(out).toContain("Run pipeline");
  });

  it("appends a forwarded 'Arguments:' line when provided", async () => {
    writeSkill(home, "greet", "Greet someone", "Say hello to the name in args.");
    const reg = new ToolRegistry();
    registerSkillTools(reg, { homeDir: home });
    const out = await reg.dispatch("run_skill", { name: "greet", arguments: "Alice" });
    expect(out).toContain("Arguments: Alice");
  });

  it("returns a structured error with available names on unknown skill", async () => {
    writeSkill(home, "review", "Review a PR", "...");
    writeSkill(home, "ship-it", "Push commit", "...");
    const reg = new ToolRegistry();
    registerSkillTools(reg, { homeDir: home });
    const out = await reg.dispatch("run_skill", { name: "nope" });
    const parsed = JSON.parse(out);
    expect(parsed.error).toMatch(/unknown skill/);
    expect(parsed.available).toContain("review");
    expect(parsed.available).toContain("ship-it");
  });

  it("rejects an empty name", async () => {
    const reg = new ToolRegistry();
    registerSkillTools(reg, { homeDir: home });
    const out = await reg.dispatch("run_skill", { name: "" });
    expect(JSON.parse(out).error).toMatch(/requires a 'name'/);
  });
});
