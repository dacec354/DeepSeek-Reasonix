#!/usr/bin/env node
/**
 * Bundle every CodeMirror package the dashboard editor needs into one
 * local ESM file at dashboard/codemirror.js. Replaces the runtime
 * esm.sh imports — CDN multi-instance issues (different copies of
 * @lezer/highlight breaking tag identity, etc.) just go away once
 * everything ships in a single bundle.
 *
 * Run after bumping any @codemirror/* package version:
 *   node scripts/bundle-codemirror.mjs
 *
 * The output is committed to the repo and shipped in the npm tarball.
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const entryPath = resolve(repoRoot, "scripts/.cm-entry.mjs");
const outPath = resolve(repoRoot, "dashboard/codemirror.js");

// Re-export every symbol the editor needs as a single flat record.
// Same shape app.js's old loadCodeMirror() returned, so swapping the
// runtime fetch for `import * as cm from "./codemirror.js"` is a
// one-line change on the consumer side.
const entry = `
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine,
  highlightActiveLineGutter, drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap, history, historyKeymap, indentWithTab,
} from "@codemirror/commands";
import {
  syntaxHighlighting, defaultHighlightStyle, bracketMatching,
  indentOnInput, foldGutter, foldKeymap,
} from "@codemirror/language";
import {
  closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap,
} from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";

import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { html as htmlLang } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { cpp } from "@codemirror/lang-cpp";
import { yaml } from "@codemirror/lang-yaml";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { php } from "@codemirror/lang-php";

export {
  EditorState, Compartment,
  EditorView, keymap, lineNumbers, highlightActiveLine,
  highlightActiveLineGutter, drawSelection,
  defaultKeymap, history, historyKeymap, indentWithTab,
  syntaxHighlighting, defaultHighlightStyle, bracketMatching,
  indentOnInput, foldGutter, foldKeymap,
  closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap,
  searchKeymap, highlightSelectionMatches,
  oneDark,
};

export const langs = {
  javascript,
  typescript: () => javascript({ typescript: true }),
  python,
  markdown,
  json,
  html: htmlLang,
  css,
  rust,
  go,
  cpp,
  yaml,
  sql,
  xml,
  php,
};
`;

mkdirSync(dirname(entryPath), { recursive: true });
writeFileSync(entryPath, entry);

await build({
  entryPoints: [entryPath],
  outfile: outPath,
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "none",
  logLevel: "info",
});

console.log(`bundled → ${outPath}`);
