/**
 * One place that defines what each preset means. Both `slash.ts`
 * (in-chat `/preset`) and the wizard (first-run setup) read from here.
 *
 * Presets are the single vocabulary we teach new users: they don't need
 * to know model IDs, reasoning effort, or thinking mode independently
 * — they pick "fast / smart / max" and we translate.
 *
 * Design rules (v0.6+):
 *   - Branching (`branch >= 2`) is NEVER in a preset. Self-consistency
 *     sampling is `N×` cost; auto-enabling it would ambush users into
 *     multi-dollar turns without asking. Opt-in only via `/branch N`.
 *   - Harvest (Pillar-2 plan-state extraction) is NEVER in a preset.
 *     In practice it's display sugar — the typed plan state hasn't
 *     fed back into orchestration decisions (branch trigger) often
 *     enough to pay for the extra round-trip. Opt-in only via
 *     `/harvest on`.
 *   - The three tiers differ on only TWO knobs: model (flash/pro) and
 *     reasoning effort (high/max). Same on-the-wire billing axis,
 *     easy to reason about, easy to budget.
 */

import type { PresetName } from "../../config.js";

export interface PresetSettings {
  model: string;
  /**
   * Reasoning-effort cap. `high` = shorter chain of thought; `max` =
   * agent-class default (deeper, more output). Effort is now decoupled
   * from preset — a separate `/effort` knob lets users tune it
   * orthogonally. The PRESETS table just picks the safest default.
   */
  reasoningEffort: "high" | "max";
  /**
   * Auto-escalation switch. `auto` keeps the legacy NEEDS_PRO + failure
   * threshold behavior; `flash` and `pro` lock to the chosen model.
   */
  autoEscalate: boolean;
  /** Pillar-2 harvest. Always false in presets — opt-in via /harvest. */
  harvest: boolean;
  /** Branch budget. Always 1 in presets — opt-in via /branch. */
  branch: number;
}

/**
 * The three real presets. Old names (`fast / smart / max`) stay alive
 * as aliases mapped through `resolvePreset` so a config.json that
 * predates this rename still works without a migration script.
 */
export const PRESETS: Record<"auto" | "flash" | "pro", PresetSettings> = {
  // auto — flash baseline + auto-escalate to pro when the model emits
  // <<<NEEDS_PRO>>> OR after 3+ tool failure signals in one turn.
  // The default: cheap when easy, smart when hard.
  auto: {
    model: "deepseek-v4-flash",
    reasoningEffort: "max",
    autoEscalate: true,
    harvest: false,
    branch: 1,
  },
  // flash — always flash, never escalate. `/pro` still arms a single
  // manual turn; auto-promotion is the thing this disables. Use when
  // you want predictable cost per turn.
  flash: {
    model: "deepseek-v4-flash",
    reasoningEffort: "max",
    autoEscalate: false,
    harvest: false,
    branch: 1,
  },
  // pro — always pro. Hard pin; the model never downgrades. Use for
  // multi-turn architecture work where flash is just going to keep
  // escalating anyway and the back-and-forth wastes turns.
  pro: {
    model: "deepseek-v4-pro",
    reasoningEffort: "max",
    autoEscalate: false,
    harvest: false,
    branch: 1,
  },
};

export const PRESET_DESCRIPTIONS: Record<
  "auto" | "flash" | "pro",
  { headline: string; cost: string }
> = {
  auto: {
    headline: "flash → pro on hard turns",
    cost: "default · ~96% turns stay on flash · pro kicks in only when needed",
  },
  flash: {
    headline: "v4-flash always",
    cost: "cheapest · predictable · /pro still works for a one-turn bump",
  },
  pro: {
    headline: "v4-pro always",
    cost: "~3× flash (5/31 discount) / ~12× full price · for hard multi-turn work",
  },
};

/**
 * Resolve a preset name (canonical or legacy) to its settings.
 * Canonical names (`auto | flash | pro`) hit the PRESETS table.
 * Legacy names from the v0.5–v0.11 vocabulary still resolve to their
 * old behavior so a `~/.reasonix/config.json` written by an older
 * Reasonix doesn't suddenly start producing different model + effort
 * choices on upgrade:
 *   - `fast`  → flash with effort=high (cheaper, predictable)
 *   - `smart` → auto    (flash + max + auto-escalate; the old default)
 *   - `max`   → pro     (pro + max)
 * Anything else collapses to `auto`.
 */
export function resolvePreset(name: PresetName | undefined): PresetSettings {
  if (name === "auto" || name === "flash" || name === "pro") return PRESETS[name];
  if (name === "fast") return { ...PRESETS.flash, reasoningEffort: "high" };
  if (name === "smart") return PRESETS.auto;
  if (name === "max") return PRESETS.pro;
  return PRESETS.auto;
}

/** Canonical name for storage / display — unknown values become auto. */
export function canonicalPresetName(name: PresetName | undefined): "auto" | "flash" | "pro" {
  if (name === "auto" || name === "flash" || name === "pro") return name;
  return "auto";
}
