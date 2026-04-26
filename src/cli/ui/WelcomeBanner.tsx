/**
 * Welcome card on the empty session. The first thing a user sees
 * after launching `reasonix code` — needs to communicate, with the
 * ~5 seconds before they type, three things: brand, what to type,
 * how to escape. Card-style framing (left bar + sectioned hints)
 * gives it visual weight without using bordered Boxes (those
 * amplified Ink's Windows eraseLines miscount).
 */

import { Box, Text } from "ink";
// biome-ignore lint/style/useImportType: tsconfig jsx=react needs React in value scope
import React from "react";

export interface WelcomeBannerProps {
  /** True when running `reasonix code`. Surfaces code-mode hints. */
  inCodeMode?: boolean;
}

export function WelcomeBanner({ inCodeMode }: WelcomeBannerProps): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1} marginY={1}>
      <BarRow color="magenta">
        <Text bold color="magenta">
          ◈ welcome
        </Text>
        <Text dimColor>{"  ·  type a message to start"}</Text>
      </BarRow>
      <BarRow color="magenta" />
      <BarRow color="magenta">
        <Text bold color="cyan">
          quick start
        </Text>
      </BarRow>
      <Hint cmd="/help" desc="every command + keyboard shortcut" />
      <Hint cmd="/skill" desc="invoke a stored playbook" />
      {inCodeMode ? (
        <>
          <Hint cmd="@path" desc="inline a file in your message" />
          <Hint cmd="!cmd" desc="run a shell command, output goes to context" />
        </>
      ) : null}
      <Hint cmd="/exit" desc="quit (Ctrl+C also works)" />
      <BarRow color="magenta" />
      <BarRow color="magenta">
        <Text dimColor italic>
          tip:
        </Text>
        <Text dimColor>{"  Ctrl+J inserts a newline · trailing \\ also continues"}</Text>
      </BarRow>
    </Box>
  );
}

/**
 * One row inside the welcome card — a left-side colored bar followed
 * by content. Children are optional so we can use this for blank
 * spacer rows (bar only) that visually anchor the card height.
 */
function BarRow({
  color,
  children,
}: {
  color: "magenta" | "cyan";
  children?: React.ReactNode;
}) {
  return (
    <Box>
      <Text color={color} bold>
        ▎
      </Text>
      <Text> </Text>
      {children}
    </Box>
  );
}

/**
 * Single hint row — bold magenta cmd token + dim description.
 * Padded so all cmd tokens line up regardless of length, like a
 * man-page synopsis.
 */
function Hint({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <BarRow color="magenta">
      <Text bold color="magenta">
        {cmd.padEnd(8)}
      </Text>
      <Text dimColor>{`  ${desc}`}</Text>
    </BarRow>
  );
}
