// Shared normalization for text files that can carry YAML frontmatter.
//
// Keep this helper pure and cheap: callers already own filesystem traversal.
// A single leading BOM is transport metadata, not document content, and CRLF
// must be interpreted exactly like LF by every frontmatter consumer.
export function normalizeText(text) {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return withoutBom.includes('\r')
    ? withoutBom.replace(/\r\n/g, '\n')
    : withoutBom;
}
