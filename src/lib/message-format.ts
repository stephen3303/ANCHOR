export const MESSAGE_LINE_LENGTH = 69;
export const MESSAGE_FORMATTING_PROFILE = { version: 2, lineLength: MESSAGE_LINE_LENGTH, wordWrap: true, hardWrap: true, newline: "LF" } as const;
const isSpace = (character: string) => /\s/u.test(character);

/** Real LF line breaks, not presentation-only CSS wrapping. Count Unicode
 * code points so a hard break never splits a surrogate pair. Existing short
 * lines, indentation, blank lines and final newlines remain intact. */
export function wrapMessageText(text: string): string {
  const lines: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const characters = Array.from(line);
    let start = 0;
    while (characters.length - start > MESSAGE_LINE_LENGTH) {
      let boundary = start + MESSAGE_LINE_LENGTH;
      while (boundary > start && !isSpace(characters[boundary])) boundary--;
      let end = boundary;
      while (end > start && isSpace(characters[end - 1])) end--;
      if (end > start) {
        lines.push(characters.slice(start, end).join(""));
        start = boundary;
        // The word separator becomes the newline; don't carry it onto the
        // continuation line. Whitespace elsewhere is not rewritten.
        while (start < characters.length && isSpace(characters[start])) start++;
      } else {
        lines.push(characters.slice(start, start + MESSAGE_LINE_LENGTH).join(""));
        start += MESSAGE_LINE_LENGTH;
      }
    }
    if (start < characters.length || !characters.length) lines.push(characters.slice(start).join(""));
  }
  return lines.join("\n");
}

export function hasOverlongMessageLine(text: string): boolean {
  return text.split(/\r\n?|\n/).some((line) => Array.from(line).length > MESSAGE_LINE_LENGTH);
}
