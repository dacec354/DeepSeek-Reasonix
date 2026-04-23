/**
 * Skills — user-defined prompt packs pinned (by name) into the
 * immutable prefix and loaded (by body) on demand.
 *
 * Two scopes mirror the user-memory layout:
 *   - `project` → `<projectRoot>/.reasonix/skills/` (this repo only)
 *   - `global`  → `~/.reasonix/skills/`            (every session)
 *
 * Project scope wins on a name collision. Deliberately NOT tied to
 * any specific client's directory convention (`.claude/`, `.glm/`,
 * etc.) — Reasonix is model-agnostic at the conversation layer, so
 * coupling the skill filesystem to one vendor would break any user
 * running a different backend.
 *
 * Accepted file layouts (both emit the same `Skill`):
 *   - `{dir}/<name>/SKILL.md`   (preferred — lets a skill bundle
 *                                additional assets alongside)
 *   - `{dir}/<name>.md`         (flat, one-file shorthand)
 *
 * Frontmatter keys we read:
 *   - `name`          — optional, defaults to the file / dir name
 *   - `description`   — one-line index description (REQUIRED for listing)
 *   - `allowed-tools` — parsed but UNUSED in v1 (see tools/skills.ts)
 *
 * Cache-First contract (Pillar 1):
 *   - The PREFIX sees only names + descriptions (one line each).
 *   - Bodies enter the APPEND-ONLY LOG lazily, via `run_skill` or
 *     `/skill <name>` — never the prefix. That keeps the prefix hash
 *     stable across skill additions to the body store.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const SKILLS_DIRNAME = "skills";
export const SKILL_FILE = "SKILL.md";
/** Cap on the pinned skills-index block, mirrors memory-index cap. */
export const SKILLS_INDEX_MAX_CHARS = 4000;
/** Skill identifier shape — alnum + `_` + `-` + interior `.`, 1-64 chars. */
const VALID_SKILL_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export type SkillScope = "project" | "global";

export interface Skill {
  /** Canonical name — sanitized, matches the directory / filename stem. */
  name: string;
  /** One-line description shown in the pinned index. */
  description: string;
  /** Full markdown body (post-frontmatter). Loaded on demand. */
  body: string;
  /** Which scope this skill was loaded from. */
  scope: SkillScope;
  /** Absolute path to the SKILL.md (or {name}.md) file. */
  path: string;
  /** Raw `allowed-tools` field from frontmatter, if any. Unused in v1. */
  allowedTools?: string;
}

export interface SkillStoreOptions {
  /** Override `$HOME` — tests point this at a tmpdir. */
  homeDir?: string;
  /**
   * Absolute project root. Required to surface project-scope skills;
   * omit (e.g. in `reasonix chat` without `code`) and the store only
   * reads the global scope.
   */
  projectRoot?: string;
}

/**
 * Parse a `---` frontmatter block. Same minimal shape as user-memory:
 * `key: value` lines, no quoting, no nesting. Returns `{}` data and the
 * full input as body when no frontmatter fence is present — so hand-
 * written files without frontmatter still surface (with empty desc).
 */
function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== "---") return { data: {}, body: raw };
  const end = lines.indexOf("---", 1);
  if (end < 0) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (!line) continue;
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (m?.[1]) data[m[1]] = (m[2] ?? "").trim();
  }
  return {
    data,
    body: lines
      .slice(end + 1)
      .join("\n")
      .replace(/^\n+/, ""),
  };
}

function isValidSkillName(name: string): boolean {
  return VALID_SKILL_NAME.test(name);
}

export class SkillStore {
  private readonly homeDir: string;
  private readonly projectRoot: string | undefined;

  constructor(opts: SkillStoreOptions = {}) {
    this.homeDir = opts.homeDir ?? homedir();
    this.projectRoot = opts.projectRoot ? resolve(opts.projectRoot) : undefined;
  }

  /** True iff this store was configured with a project root. */
  hasProjectScope(): boolean {
    return this.projectRoot !== undefined;
  }

  /**
   * Root directories scanned, in priority order. Project scope first
   * so a per-repo skill overrides a global one with the same name —
   * users expect the local copy to win when both exist.
   */
  roots(): Array<{ dir: string; scope: SkillScope }> {
    const out: Array<{ dir: string; scope: SkillScope }> = [];
    if (this.projectRoot) {
      out.push({
        dir: join(this.projectRoot, ".reasonix", SKILLS_DIRNAME),
        scope: "project",
      });
    }
    out.push({ dir: join(this.homeDir, ".reasonix", SKILLS_DIRNAME), scope: "global" });
    return out;
  }

  /**
   * List every skill visible to this store. On name collisions the
   * higher-priority root (project over global) wins. Sorted by name
   * for stable prefix hashing.
   */
  list(): Skill[] {
    const byName = new Map<string, Skill>();
    for (const { dir, scope } of this.roots()) {
      if (!existsSync(dir)) continue;
      let entries: import("node:fs").Dirent[];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const skill = this.readEntry(dir, scope, entry);
        if (!skill) continue;
        if (!byName.has(skill.name)) byName.set(skill.name, skill);
      }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Resolve one skill by name. Returns `null` if not found or malformed. */
  read(name: string): Skill | null {
    if (!isValidSkillName(name)) return null;
    for (const { dir, scope } of this.roots()) {
      if (!existsSync(dir)) continue;
      const dirCandidate = join(dir, name, SKILL_FILE);
      if (existsSync(dirCandidate) && statSync(dirCandidate).isFile()) {
        return this.parse(dirCandidate, name, scope);
      }
      const flatCandidate = join(dir, `${name}.md`);
      if (existsSync(flatCandidate) && statSync(flatCandidate).isFile()) {
        return this.parse(flatCandidate, name, scope);
      }
    }
    return null;
  }

  private readEntry(dir: string, scope: SkillScope, entry: import("node:fs").Dirent): Skill | null {
    if (entry.isDirectory()) {
      if (!isValidSkillName(entry.name)) return null;
      const file = join(dir, entry.name, SKILL_FILE);
      if (!existsSync(file)) return null;
      return this.parse(file, entry.name, scope);
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      const stem = entry.name.slice(0, -3);
      if (!isValidSkillName(stem)) return null;
      return this.parse(join(dir, entry.name), stem, scope);
    }
    return null;
  }

  private parse(path: string, stem: string, scope: SkillScope): Skill | null {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      return null;
    }
    const { data, body } = parseFrontmatter(raw);
    const name = data.name && isValidSkillName(data.name) ? data.name : stem;
    return {
      name,
      description: (data.description ?? "").trim(),
      body: body.trim(),
      scope,
      path,
      allowedTools: data["allowed-tools"],
    };
  }
}

/**
 * Build a single index line for one skill. Shape mirrors memory's
 * `indexLine` — a bullet suitable for a markdown fenced block in the
 * system prompt. Description is truncated to keep the full line under
 * ~150 chars.
 */
function skillIndexLine(s: Pick<Skill, "name" | "description">): string {
  const safeDesc = s.description.replace(/\n/g, " ").trim();
  const max = 130 - s.name.length;
  const clipped = safeDesc.length > max ? `${safeDesc.slice(0, Math.max(1, max - 1))}…` : safeDesc;
  return clipped ? `- ${s.name} — ${clipped}` : `- ${s.name}`;
}

/**
 * Append a `# Skills` block to `basePrompt` listing every discovered
 * skill (name + description only). Bodies are NOT inlined — that's the
 * whole point: the prefix stays short and cacheable; full content loads
 * on demand via `run_skill` or `/skill <name>`.
 *
 * Emits nothing when no skills are discovered — keeps the prefix hash
 * stable for users who don't use skills at all.
 */
export function applySkillsIndex(basePrompt: string, opts: SkillStoreOptions = {}): string {
  const store = new SkillStore(opts);
  const skills = store.list().filter((s) => s.description);
  if (skills.length === 0) return basePrompt;
  const lines = skills.map(skillIndexLine);
  const joined = lines.join("\n");
  const truncated =
    joined.length > SKILLS_INDEX_MAX_CHARS
      ? `${joined.slice(0, SKILLS_INDEX_MAX_CHARS)}\n… (truncated ${
          joined.length - SKILLS_INDEX_MAX_CHARS
        } chars)`
      : joined;
  return [
    basePrompt,
    "",
    "# Skills — user-defined prompt packs",
    "",
    'One-liner index. Each skill is a self-contained instruction block (plus optional tool hints) the user or an earlier session saved. To load the full body, call `run_skill({ name: "<skill-name>" })` — the body is NOT in this prompt, only the name and description are. The user can also invoke a skill directly as `/skill <name>`.',
    "",
    "```",
    truncated,
    "```",
  ].join("\n");
}
