import assert from "node:assert/strict";
import { test } from "node:test";

import { splitHighlights } from "./highlight.js";

const marked = (parts) => parts.filter((part) => part.match).map((part) => part.text);

test("marks every case-insensitive match and keeps the text intact", () => {
  const text = "MFA is required. Review mfa yearly.";
  const parts = splitHighlights(text, ["mfa"]);
  assert.deepEqual(marked(parts), ["MFA", "mfa"]);
  assert.equal(parts.map((part) => part.text).join(""), text);
});

test("prefers the longer term where terms overlap", () => {
  assert.deepEqual(marked(splitHighlights("access reviews", ["access", "access reviews"])), ["access reviews"]);
});

test("phrases match across line breaks and repeated spaces", () => {
  assert.deepEqual(marked(splitHighlights("access\n  reviews", ["access reviews"])), ["access\n  reviews"]);
});

test("treats regular-expression characters literally", () => {
  assert.deepEqual(marked(splitHighlights("100% of (all) a.b axb", ["100%", "(all)", "a.b"])), ["100%", "(all)", "a.b"]);
});

test("handles empty input", () => {
  assert.deepEqual(splitHighlights("", ["x"]), []);
  assert.deepEqual(splitHighlights("plain", []), [{ text: "plain", match: false }]);
});
