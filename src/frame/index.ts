/**
 * Public surface of the Frame compiler. Phase 1 of the long-term
 * Ink-replacement migration. Components compile to `Frame` data,
 * primitives compose them, the paint layer renders to terminal.
 */

export type { Cell, Frame, FrameRow, TextOpts } from "./types.js";
export {
  blank,
  borderLeft,
  bottom,
  empty,
  fitWidth,
  hstack,
  overlay,
  pad,
  slice,
  text,
  viewport,
  vstack,
} from "./frame.js";
export { frameToAnsi, rowText } from "./ansi.js";
export { graphemeWidth, graphemes, stringWidth } from "./width.js";
