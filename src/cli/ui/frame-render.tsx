/**
 * Generic Frame → Ink JSX renderer. Wraps each Frame row in a
 * `<Box height={1}><Text>{ansi}</Text></Box>` so the row count is
 * exact and Ink's overflow=hidden clips natural overflow at
 * parent bounds.
 *
 * Used by all the Phase-6+ migrated regions (chrome, log, modals,
 * prompt) so the rendering path is uniform — every Frame goes
 * through the same one-row-per-Box translation.
 *
 * In Phase 7 (drop Ink) this module gets replaced by a direct
 * stdout paint layer that diffs frames between renders. Until
 * then, Ink's `<Box>` + `<Text>` is the dumb backing store.
 */

import { Box, Text } from "ink";
// biome-ignore lint/style/useImportType: tsconfig jsx=react needs React in value scope for JSX compilation
import React from "react";
import { type Frame, frameToAnsi } from "../../frame/index.js";

/**
 * Render a Frame as a stack of `<Box height={1}>` rows. Each row is
 * one terminal line with embedded ANSI styling. `keyPrefix` lets the
 * caller distinguish multiple frames in the same parent so React
 * keys don't collide.
 */
export function renderFrame(f: Frame, keyPrefix: string): React.ReactElement {
  return (
    <>
      {f.rows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: row identity here IS its index — a Frame is a fixed-position grid, rows don't reorder, replacing a row at index N legitimately means "the cell at row N changed" and the index key is the right semantic
        <Box key={`${keyPrefix}/${i}`} height={1} flexShrink={0}>
          <Text>{frameToAnsi({ width: f.width, rows: [row] })}</Text>
        </Box>
      ))}
    </>
  );
}
