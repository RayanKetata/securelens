function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * Split text into parts, marking those that match any of the terms
 * (case-insensitive). Longer terms win where terms overlap. Returned
 * parts are rendered as text, never as HTML.
 */
export function splitHighlights(text, terms) {
  const usable = [...new Set((terms || []).map((term) => term.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);

  if (!text) {
    return [];
  }

  if (usable.length === 0) {
    return [{ text, match: false }];
  }

  // Whitespace in a phrase matches any run of whitespace.
  const pattern = new RegExp(
    usable.map((term) => escapeRegExp(term).replace(/\s+/g, "\\s+")).join("|"),
    "gi"
  );

  const parts = [];
  let last = 0;

  for (const found of text.matchAll(pattern)) {
    if (found.index > last) {
      parts.push({ text: text.slice(last, found.index), match: false });
    }
    parts.push({ text: found[0], match: true });
    last = found.index + found[0].length;
  }

  if (last < text.length) {
    parts.push({ text: text.slice(last), match: false });
  }

  return parts;
}
