import assert from "node:assert/strict";
import { test } from "node:test";
import { hasOverlongMessageLine, MESSAGE_LINE_LENGTH, wrapMessageText } from "./message-format";
import { renderGeneratedMessage } from "./message-templates";

const assertWidth = (text: string) => assert.ok(text.split("\n").every((line) => Array.from(line).length <= MESSAGE_LINE_LENGTH));

test("short lines, exact-width lines, indentation and explicit breaks survive wrapping", () => {
  for (const text of ["", "\n", "  FM COMMAND\n\nBT\n", "A".repeat(69), "short  text  ", "  spaced\n\n"]) assert.equal(wrapMessageText(text), text);
  assert.equal(wrapMessageText("FM COMMAND\r\nBT\rNNNN"), "FM COMMAND\nBT\nNNNN");
});

test("wraps at the last word separator within 69 characters", () => {
  assert.equal(wrapMessageText(`${"A".repeat(35)} ${"B".repeat(34)}`), `${"A".repeat(35)}\n${"B".repeat(34)}`);
  assert.equal(wrapMessageText(`${"A".repeat(69)} next`), `${"A".repeat(69)}\nnext`);
  assert.equal(wrapMessageText(`${"A".repeat(65)}   next`), `${"A".repeat(65)}\nnext`);
});

test("hard breaks uninterrupted text at character 69 without losing characters", () => {
  assert.equal(wrapMessageText("x".repeat(70)), `${"x".repeat(69)}\nx`);
  const text = "0123456789".repeat(25);
  const wrapped = wrapMessageText(text);
  assertWidth(wrapped);
  assert.equal(wrapped.replaceAll("\n", ""), text);
  assert.equal(wrapMessageText(" ".repeat(140)), `${" ".repeat(69)}\n${" ".repeat(69)}\n  `);
});

test("wraps Unicode code points without breaking surrogate pairs", () => {
  const text = "😀".repeat(70);
  assert.equal(wrapMessageText(text), `${"😀".repeat(69)}\n😀`);
  assertWidth(wrapMessageText(text));
  assert.equal(hasOverlongMessageLine(text), true);
  assert.equal(hasOverlongMessageLine(wrapMessageText(text)), false);
});

test("wrapping is idempotent and handles mixed long words and preserved blank lines", () => {
  const text = `  RMKS/${"word ".repeat(70)}\n\n${"Z".repeat(210)}\nBT\n`;
  const wrapped = wrapMessageText(text);
  assertWidth(wrapped);
  assert.equal(wrapMessageText(wrapped), wrapped);
  assert.ok(wrapped.includes("\n\n"));
  assert.ok(wrapped.endsWith("\nBT\n"));
});

test("generated output wraps after substitution and includes newlines in size limits", () => {
  const output = renderGeneratedMessage("TO {{ Commands }}\n{{ Body }}", { Commands: ["A".repeat(40), "B".repeat(40)], Body: "C".repeat(70) });
  assertWidth(output);
  assert.equal(output, `TO ${"A".repeat(40)};\n${"B".repeat(40)}\n${"C".repeat(69)}\nC`);
  assert.throws(() => renderGeneratedMessage("{{ Body }}", { Body: "x".repeat(70) }, [], 70), /too large after line wrapping/);
});
