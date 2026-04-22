/**
 * Tests for the loop's error-message decorator. Scope is narrow:
 * context-overflow errors get a user-friendly hint, everything else
 * passes through unchanged.
 */

import { describe, expect, it } from "vitest";
import { formatLoopError } from "../src/loop.js";

describe("formatLoopError", () => {
  it("annotates a DeepSeek 400 'maximum context length' error", () => {
    const raw = new Error(
      'DeepSeek 400: {"error":{"message":"This model\'s maximum context length is 131072 tokens. ' +
        "However, you requested 929452 tokens (929452 in the messages, 0 in the completion). " +
        'Please reduce the length of the messages or completion."}}',
    );
    const out = formatLoopError(raw);
    expect(out).toMatch(/Context overflow/);
    expect(out).toMatch(/\/forget/);
    expect(out).toMatch(/929,452 tokens/); // pretty-printed from the raw JSON
  });

  it("leaves non-overflow errors unchanged", () => {
    const raw = new Error("DeepSeek 401: invalid api key");
    expect(formatLoopError(raw)).toBe("DeepSeek 401: invalid api key");
  });

  it("tolerates an overflow error without a requested-tokens figure", () => {
    const raw = new Error("DeepSeek 400: This model's maximum context length is 131072 tokens.");
    const out = formatLoopError(raw);
    expect(out).toMatch(/Context overflow/);
    expect(out).toMatch(/too many tokens/);
  });
});
