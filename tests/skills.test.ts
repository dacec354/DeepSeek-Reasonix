/**
 * Tests for the Skills store + prefix-index composer. Every test runs
 * against a temp `homeDir` (global scope) and a temp `projectRoot`
 * (project scope) so we never touch the developer's real skill dirs.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillStore, applySkillsIndex } from "../src/skills.js";

const BASE = "You are a test assistant.";

type SkillRoot = "project" | "global";

function writeSkillDir(
  root: string,
  which: SkillRoot,
  name: string,
  frontmatter: Record<string, string>,
  body: string,
  homeOrProject: string,
): string {
  const parent =
    which === "global"
      ? join(homeOrProject, ".reasonix", "skills")
      : join(root, ".reasonix", "skills");
  const dir = join(parent, name);
  mkdirSync(dir, { recursive: true });
  const fmLines = ["---"];
  for (const [k, v] of Object.entries(frontmatter)) fmLines.push(`${k}: ${v}`);
  fmLines.push("---", "");
  const path = join(dir, "SKILL.md");
  writeFileSync(path, `${fmLines.join("\n")}${body}\n`, "utf8");
  return path;
}

function writeFlatSkill(
  dir: string,
  name: string,
  frontmatter: Record<string, string>,
  body: string,
): string {
  const skills = join(dir, ".reasonix", "skills");
  mkdirSync(skills, { recursive: true });
  const fmLines = ["---"];
  for (const [k, v] of Object.entries(frontmatter)) fmLines.push(`${k}: ${v}`);
  fmLines.push("---", "");
  const path = join(skills, `${name}.md`);
  writeFileSync(path, `${fmLines.join("\n")}${body}\n`, "utf8");
  return path;
}

describe("SkillStore", () => {
  let home: string;
  let projectRoot: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "reasonix-skills-home-"));
    projectRoot = mkdtempSync(join(tmpdir(), "reasonix-skills-proj-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("returns an empty list when no skill dirs exist", () => {
    const store = new SkillStore({ homeDir: home, projectRoot });
    expect(store.list()).toEqual([]);
  });

  it("hasProjectScope reflects constructor argument", () => {
    expect(new SkillStore({ homeDir: home }).hasProjectScope()).toBe(false);
    expect(new SkillStore({ homeDir: home, projectRoot }).hasProjectScope()).toBe(true);
  });

  it("parses a SKILL.md dir-layout entry from the global scope", () => {
    writeSkillDir(
      projectRoot,
      "global",
      "review",
      { name: "review", description: "Review a pull request" },
      "Run `git diff` and summarize risks.",
      home,
    );
    const skills = new SkillStore({ homeDir: home, projectRoot }).list();
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("review");
    expect(skills[0]?.scope).toBe("global");
    expect(skills[0]?.body).toContain("git diff");
  });

  it("reads flat <name>.md files as well", () => {
    writeFlatSkill(home, "ship-it", { description: "Commit and push changes" }, "body");
    const skills = new SkillStore({ homeDir: home, projectRoot }).list();
    expect(skills.map((s) => s.name)).toEqual(["ship-it"]);
    expect(skills[0]?.description).toBe("Commit and push changes");
  });

  it("surfaces project-scope skills from <projectRoot>/.reasonix/skills", () => {
    writeSkillDir(
      projectRoot,
      "project",
      "deploy",
      { description: "Deploy to staging" },
      "Run the staging pipeline.",
      home,
    );
    const list = new SkillStore({ homeDir: home, projectRoot }).list();
    expect(list).toHaveLength(1);
    expect(list[0]?.scope).toBe("project");
    expect(list[0]?.path).toContain(projectRoot);
  });

  it("project scope wins on a name collision with global", () => {
    writeSkillDir(projectRoot, "global", "review", { description: "global one" }, "G", home);
    writeSkillDir(projectRoot, "project", "review", { description: "project one" }, "P", home);
    const store = new SkillStore({ homeDir: home, projectRoot });
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.scope).toBe("project");
    expect(list[0]?.description).toBe("project one");
    expect(store.read("review")?.body).toBe("P");
  });

  it("without projectRoot the store only reads the global scope", () => {
    // Put a skill in the project dir and a skill in the global dir.
    writeSkillDir(projectRoot, "project", "deploy", { description: "proj" }, "P", home);
    writeSkillDir(projectRoot, "global", "review", { description: "glob" }, "G", home);
    const store = new SkillStore({ homeDir: home }); // no projectRoot
    const names = store.list().map((s) => s.name);
    expect(names).toEqual(["review"]);
    expect(store.hasProjectScope()).toBe(false);
  });

  it("rejects invalid skill names on read()", () => {
    const store = new SkillStore({ homeDir: home, projectRoot });
    expect(store.read("../etc/passwd")).toBeNull();
    expect(store.read("foo/bar")).toBeNull();
    expect(store.read("")).toBeNull();
  });

  it("skips dotfiles that would masquerade as skills", () => {
    writeSkillDir(projectRoot, "global", "ok", { description: "fine" }, "body", home);
    const dotDir = join(home, ".reasonix", "skills");
    writeFileSync(join(dotDir, ".hidden.md"), "---\ndescription: x\n---\nbody\n", "utf8");
    const list = new SkillStore({ homeDir: home, projectRoot }).list();
    expect(list.map((s) => s.name)).toEqual(["ok"]);
  });
});

describe("applySkillsIndex", () => {
  let home: string;
  let projectRoot: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "reasonix-skills-idx-"));
    projectRoot = mkdtempSync(join(tmpdir(), "reasonix-skills-idx-proj-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("returns the prompt unchanged when no skills exist", () => {
    const out = applySkillsIndex(BASE, { homeDir: home, projectRoot });
    expect(out).toBe(BASE);
  });

  it("emits a Skills section with one-liners but not bodies", () => {
    writeSkillDir(
      projectRoot,
      "global",
      "review",
      { description: "Review a pull request" },
      "BODY-THAT-MUST-NOT-APPEAR",
      home,
    );
    writeSkillDir(
      projectRoot,
      "global",
      "init",
      { description: "Initialize a CLAUDE.md" },
      "ALSO-SECRET",
      home,
    );
    const out = applySkillsIndex(BASE, { homeDir: home, projectRoot });
    expect(out).toContain("# Skills");
    expect(out).toContain("- init — Initialize a CLAUDE.md");
    expect(out).toContain("- review — Review a pull request");
    expect(out).not.toContain("BODY-THAT-MUST-NOT-APPEAR");
    expect(out).not.toContain("ALSO-SECRET");
  });

  it("merges project + global skills into a single index", () => {
    writeSkillDir(projectRoot, "global", "hello", { description: "global hello" }, "x", home);
    writeSkillDir(projectRoot, "project", "deploy", { description: "project deploy" }, "y", home);
    const out = applySkillsIndex(BASE, { homeDir: home, projectRoot });
    expect(out).toContain("- deploy — project deploy");
    expect(out).toContain("- hello — global hello");
  });

  it("omits skills with blank descriptions from the pinned index", () => {
    writeSkillDir(projectRoot, "global", "has-desc", { description: "I have one" }, "body", home);
    writeSkillDir(projectRoot, "global", "no-desc", {}, "body", home);
    const out = applySkillsIndex(BASE, { homeDir: home, projectRoot });
    expect(out).toContain("- has-desc —");
    expect(out).not.toContain("- no-desc");
  });

  it("is byte-stable across two calls with the same filesystem state", () => {
    writeSkillDir(projectRoot, "global", "a", { description: "one" }, "x", home);
    writeSkillDir(projectRoot, "global", "b", { description: "two" }, "y", home);
    const first = applySkillsIndex(BASE, { homeDir: home, projectRoot });
    const second = applySkillsIndex(BASE, { homeDir: home, projectRoot });
    expect(first).toBe(second);
  });
});
