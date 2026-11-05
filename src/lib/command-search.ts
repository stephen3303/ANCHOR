export const COMMAND_SEARCH_PAGE_SIZE = 50;

/** Literal, case-insensitive matches. Render these as text/mark nodes, never
 * HTML, so directory names and regex-looking search terms stay inert. */
export function commandMatchParts(name: string, query: string): { text: string; match: boolean }[] {
  const term = query.trim();
  if (!term) return [{ text: name, match: false }];
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts: { text: string; match: boolean }[] = [];
  let end = 0;
  for (const found of name.matchAll(new RegExp(escaped, "giu"))) {
    const start = found.index;
    if (start > end) parts.push({ text: name.slice(end, start), match: false });
    parts.push({ text: found[0], match: true });
    end = start + found[0].length;
  }
  if (end < name.length) parts.push({ text: name.slice(end), match: false });
  return parts;
}
