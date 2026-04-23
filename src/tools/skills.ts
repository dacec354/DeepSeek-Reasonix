/**
 * `run_skill` — load one user skill's body into the conversation.
 *
 * The Skills index (names + one-liners) is pinned in the system prompt
 * by `applySkillsIndex`. That's enough context for the model to decide
 * *which* skill to invoke, but the body is NOT in the prefix — calling
 * this tool is how the body enters the turn. The tool result is the
 * full markdown instruction block; the model reads it and continues
 * the normal tool-use loop to follow whatever the skill prescribes.
 *
 * v1 deliberately ignores each skill's `allowed-tools` frontmatter:
 * Reasonix's tool namespace (`filesystem`, `shell`, `web`) doesn't
 * align with Claude Code's (`Read`, `Bash`, `Grep`) so a literal pass
 * would give wrong answers. Skills written for Claude Code still run —
 * the model reads the prose instructions and picks our equivalents.
 */

import { SkillStore } from "../skills.js";
import type { ToolRegistry } from "../tools.js";

export interface SkillToolsOptions {
  /** Override `$HOME` — tests set this to a tmpdir. */
  homeDir?: string;
  /**
   * Absolute project root — enables discovery of project-scope skills
   * under `<projectRoot>/.reasonix/skills/`. Omit for chat mode (global
   * scope only).
   */
  projectRoot?: string;
}

export function registerSkillTools(
  registry: ToolRegistry,
  opts: SkillToolsOptions = {},
): ToolRegistry {
  const store = new SkillStore({ homeDir: opts.homeDir, projectRoot: opts.projectRoot });

  registry.register({
    name: "run_skill",
    description:
      "Load the full body of a user-defined skill into this conversation. Call when the pinned Skills index (in the system prompt) lists a skill whose description matches what's being asked. Returns the skill's markdown instructions — read them and continue the loop, calling whatever filesystem / shell / web tools the skill's prose requires. Skills are user content; follow their instructions, but keep Reasonix's own safety rules (no destructive ops without confirmation, etc.).",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Skill identifier as it appears in the pinned Skills index (e.g. 'review', 'security-review'). Case-sensitive.",
        },
        arguments: {
          type: "string",
          description:
            "Optional free-form arguments the caller wants the skill to act on. Forwarded verbatim as an 'Arguments:' line appended to the skill body; the skill's own instructions decide how to consume them.",
        },
      },
      required: ["name"],
    },
    fn: async (args: { name?: unknown; arguments?: unknown }) => {
      const name = typeof args.name === "string" ? args.name.trim() : "";
      if (!name) {
        return JSON.stringify({ error: "run_skill requires a 'name' argument" });
      }
      const skill = store.read(name);
      if (!skill) {
        const available = store
          .list()
          .map((s) => s.name)
          .join(", ");
        return JSON.stringify({
          error: `unknown skill: ${JSON.stringify(name)}`,
          available: available || "(none — user has not defined any skills)",
        });
      }
      const rawArgs = typeof args.arguments === "string" ? args.arguments.trim() : "";
      const header = [
        `# Skill: ${skill.name}`,
        skill.description ? `> ${skill.description}` : "",
        `(scope: ${skill.scope} · ${skill.path})`,
      ]
        .filter(Boolean)
        .join("\n");
      const argsBlock = rawArgs ? `\n\nArguments: ${rawArgs}` : "";
      // The body is handed to the model verbatim. No truncation — the
      // user authored it, we trust their length choice. The append-only
      // log pays the token cost exactly once per invocation.
      return `${header}\n\n${skill.body}${argsBlock}`;
    },
  });

  return registry;
}
