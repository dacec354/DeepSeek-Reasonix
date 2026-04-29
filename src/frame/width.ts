/**
 * Visual cell-width calculations for the Frame compiler. Replaces
 * the `string-width` npm dependency (which Ink uses) with a focused
 * implementation that:
 *
 *   · understands grapheme clusters via `Intl.Segmenter` so
 *     emoji ZWJ sequences (`👨‍👩‍👧`) count as ONE rendered cell, not
 *     three glued-together codepoints
 *   · knows zero-width about ANSI/OSC escape sequences (we don't
 *     STORE escapes in Frame data, so this is moot, but the helper
 *     is exported for legacy call sites converting strings)
 *   · returns 2 for the East Asian Wide / Fullwidth / common emoji
 *     ranges and 0 for combining marks / variation selectors / zero-
 *     width joiners
 *
 * Coverage is "common modern usage" — full Unicode East Asian Width
 * tables are 1500+ ranges; we ship the biggest blocks and accept a
 * miss-rate under 1% for exotic scripts. The paint layer's terminal
 * driver is the final authority anyway, so a one-cell drift in some
 * obscure script doesn't break layout.
 */

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

/**
 * Split a string into grapheme clusters. A grapheme is what humans
 * read as "one character" — `é` (1), `👨‍👩‍👧` (1 emoji), `한` (1 syllable).
 * We layout cell-by-cell using graphemes so combining marks stay
 * attached to their base and ZWJ-emoji don't get torn at wrap
 * boundaries.
 */
export function graphemes(s: string): string[] {
  return Array.from(segmenter.segment(s), (seg) => seg.segment);
}

/**
 * Visual cell width of one grapheme:
 *   0 — zero-width: combining marks (U+0300-036F), ZWJ (U+200D),
 *       variation selectors (U+FE00-FE0F, U+E0100-E01EF), control
 *       chars (< U+0020 except newline / tab handled by caller)
 *   2 — wide: CJK ideographs, Hangul syllables, Hiragana, Katakana,
 *       Fullwidth Latin, common emoji presentation
 *   1 — narrow: everything else (ASCII, Latin, Cyrillic, etc.)
 *
 * For a grapheme with multiple codepoints (`é` = `e` + combining
 * acute), we look at the FIRST base codepoint to decide. Subsequent
 * combining marks stay zero-width (already part of this grapheme,
 * not a separate cell).
 */
export function graphemeWidth(g: string): 0 | 1 | 2 {
  if (g.length === 0) return 0;
  const cp = g.codePointAt(0)!;
  // Zero-width controls + combining
  if (cp < 0x20) return 0;
  if (cp === 0x7f) return 0;
  if (cp >= 0x0300 && cp <= 0x036f) return 0; // Combining diacritical marks
  if (cp === 0x200d) return 0; // ZWJ
  if (cp >= 0xfe00 && cp <= 0xfe0f) return 0; // Variation selectors
  if (cp >= 0xe0100 && cp <= 0xe01ef) return 0; // Variation selectors supplement
  if (cp >= 0x200b && cp <= 0x200f) return 0; // ZW spaces / directional marks
  if (cp >= 0x2060 && cp <= 0x2064) return 0; // Word joiner / invisible separators
  // Wide blocks (East Asian + emoji)
  if (
    // Hangul Jamo
    (cp >= 0x1100 && cp <= 0x115f) ||
    // CJK Radicals + Symbols / Punctuation
    (cp >= 0x2e80 && cp <= 0x303e) ||
    // Hiragana / Katakana / Bopomofo / Hangul Compat / Kanbun /
    // Bopomofo Ext / CJK Strokes / Katakana Phonetic Ext / Enclosed
    // CJK Letters / CJK Compat
    (cp >= 0x3041 && cp <= 0x33ff) ||
    // CJK Unified Ext A
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    // CJK Unified Ideographs (the big block)
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    // Yi Syllables / Radicals
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    // Hangul Syllables
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    // CJK Compat Ideographs
    (cp >= 0xf900 && cp <= 0xfaff) ||
    // CJK Compat Forms
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    // Fullwidth Forms
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    // Emoticons / Misc Symbols and Pictographs / Transport / Misc
    // Symbols / Supplemental Symbols / Symbols and Pictographs Ext-A
    (cp >= 0x1f000 && cp <= 0x1faff) ||
    // CJK Unified Ext B–G (rare characters)
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2;
  }
  // Single codepoints in the symbol range that historically render
  // wide in modern terminals (heart, star, etc.) — we keep these
  // as 1 to match xterm / VS Code default; fancy terminals like iTerm
  // override per-glyph, which would create a one-cell drift, but
  // that's a known terminal-vs-app disagreement we can't resolve
  // from app-side.
  return 1;
}

/**
 * Total visual width of a string, summing graphemes. Used by tests
 * and the legacy Ink-→-Frame migration path; the Frame compiler
 * itself works with `Cell` objects whose `width` is already known.
 */
export function stringWidth(s: string): number {
  let w = 0;
  for (const g of graphemes(s)) w += graphemeWidth(g);
  return w;
}
