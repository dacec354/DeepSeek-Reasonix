/**
 * Modal-style approval for a `submit_plan` proposal.
 *
 * Three choices:
 *   1. Approve + implement — exits plan mode, pushes a synthetic user
 *      message telling the model to implement the plan now.
 *   2. Refine — stays in plan mode; tells the model to explore more
 *      and submit an improved plan.
 *   3. Cancel — exits plan mode, drops the plan, tells the model the
 *      user didn't want any of it.
 *
 * Mirrors ShellConfirm in structure (border, SingleSelect, three
 * options, no y/n hotkey — mid-typing triggers would be painful).
 * The plan body is rendered verbatim above the picker so the user can
 * actually read what they're approving.
 */

import { Box, Text } from "ink";
import React from "react";
import { SingleSelect } from "./Select.js";
import { Markdown } from "./markdown.js";

export type PlanConfirmChoice = "approve" | "refine" | "cancel";

export interface PlanConfirmProps {
  plan: string;
  onChoose: (choice: PlanConfirmChoice) => void;
  /**
   * Cap on rendered plan length. A pathological 20-KB plan would push
   * the picker off the bottom of the terminal; we show the head +
   * "(…N chars truncated — /tool for full output)" instead. The picker
   * itself gets the full plan (it's already been committed to the
   * transcript via the tool result).
   */
  maxRenderedChars?: number;
  projectRoot?: string;
  /**
   * Override the terminal-row count used for vertical clamping. Tests
   * pass this to avoid depending on `process.stdout.rows`; runtime
   * callers leave it unset and we read the real TTY size.
   */
  terminalRows?: number;
}

const DEFAULT_MAX_RENDERED = 2400;
/**
 * Reserved rows for the picker chrome (border + header + divider +
 * open-questions hint + SingleSelect with three options + footer + the
 * assistant-turn block Ink already printed above). Empirically ~16 on a
 * wide terminal; we round up to 18 to leave a visible strip of the plan
 * even on a 24-row default instead of pushing the picker out of view.
 *
 * When the terminal is this tall or shorter we fall through to a
 * minimum of 6 rendered body lines so the user sees SOMETHING rather
 * than a single-line stub.
 */
const PICKER_CHROME_ROWS = 18;
const MIN_BODY_ROWS = 6;

/**
 * Trim `text` to the first `maxLines` lines, appending a truncation
 * marker when it was cut. Each line is clamped to ~ terminal width so
 * wrapped lines don't double-count against the row budget — we can't
 * know the exact rendered height of a Markdown block (headings, code
 * fences, list bullets add chrome), so the row cap is conservative on
 * purpose.
 */
export function clampBodyByLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  const kept = lines.slice(0, maxLines).join("\n");
  const dropped = lines.length - maxLines;
  return `${kept}\n\n… (${dropped} more lines truncated — resize the terminal to see more, or /tool for the full proposal)`;
}

function PlanConfirmInner({
  plan,
  onChoose,
  maxRenderedChars,
  projectRoot,
  terminalRows,
}: PlanConfirmProps) {
  const cap = maxRenderedChars ?? DEFAULT_MAX_RENDERED;
  const charTrunc = plan.length > cap;
  const charCapped = charTrunc
    ? `${plan.slice(0, cap)}\n\n… (${plan.length - cap} chars truncated — use /tool to view the full proposal)`
    : plan;
  // Vertical clamp. Flicker root-cause: when rendered content exceeds
  // the TTY row count Ink falls back to "clear + full redraw" each
  // frame, and every parent re-render redraws the big Markdown subtree.
  // Capping the body to (rows - picker chrome) keeps the whole modal
  // inside the terminal so Ink uses incremental diffs and the picker
  // stops thrashing. See Bug A in 0.5.14.
  const rows = terminalRows ?? process.stdout?.rows ?? 24;
  const bodyRowBudget = Math.max(MIN_BODY_ROWS, rows - PICKER_CHROME_ROWS);
  const visible = clampBodyByLines(charCapped, bodyRowBudget);
  // Crude signal for "the model left questions or risks for me" — the
  // typical section headings. Triggers an extra hint toward the Refine
  // option so users know where to answer them.
  const hasOpenQuestions =
    /^#{1,6}\s*(open[-\s]?questions?|risks?|unknowns?|assumptions?|unclear)/im.test(plan) ||
    /^#{1,6}\s*(待确认|开放问题|风险|未知|假设|不确定)/im.test(plan);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginY={1}>
      <Box>
        <Text bold color="cyan">
          ▸ plan submitted — awaiting your review
        </Text>
      </Box>
      <Box>
        <Text color="cyan" dimColor>
          {"──────────────────────────────────────────"}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Markdown text={visible} projectRoot={projectRoot} />
      </Box>
      {hasOpenQuestions ? (
        <Box marginTop={1}>
          <Text color="yellow">
            ▲ the plan has open questions or flagged risks — pick{" "}
            <Text bold>Refine / answer questions</Text> to write concrete answers before the model
            moves on.
          </Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <SingleSelect
          initialValue={hasOpenQuestions ? "refine" : "approve"}
          items={[
            {
              value: "approve",
              label: "Approve and implement",
              hint: "Exit plan mode. The model starts executing. You'll get a text input to add any last instructions (or just press Enter to skip).",
            },
            {
              value: "refine",
              label: "Refine / answer questions",
              hint: "Stay in plan mode. Write answers, modifications, or critiques; the model revises and re-submits.",
            },
            {
              value: "cancel",
              label: "Cancel",
              hint: "Exit plan mode. Drop the plan; the model won't implement it.",
            },
          ]}
          onSubmit={(v) => onChoose(v as PlanConfirmChoice)}
          onCancel={() => onChoose("cancel")}
          footer="[↑↓] navigate  ·  [Enter] select  ·  [Esc] cancel"
        />
      </Box>
    </Box>
  );
}

// React.memo: parent App re-renders every 120ms while the global ticker
// is running (even with the live status rows hidden — context changes
// propagate). Unless props change, skip re-rendering the heavy Markdown
// subtree. Default shallow prop compare is fine — `plan` + `onChoose`
// identity + `projectRoot` are the only fields that change.
export const PlanConfirm = React.memo(PlanConfirmInner);
