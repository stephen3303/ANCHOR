import assert from "node:assert/strict";
import { test } from "node:test";
import { commandMatchParts, COMMAND_SEARCH_PAGE_SIZE } from "./command-search";

test("command result pages contain twice the previous 25 results", () => {
  assert.equal(COMMAND_SEARCH_PAGE_SIZE, 50);
});

test("highlights every case-insensitive occurrence while retaining original text", () => {
  assert.deepEqual(commandMatchParts("NORFOLK VA / Norfolk VA", " norfolk "), [
    { text: "NORFOLK", match: true }, { text: " VA / ", match: false },
    { text: "Norfolk", match: true }, { text: " VA", match: false },
  ]);
  assert.deepEqual(commandMatchParts("ÅLESUND", "åle"), [{ text: "ÅLE", match: true }, { text: "SUND", match: false }]);
});

test("multiword and regex-looking queries are literal, not patterns or HTML", () => {
  for (const query of ["norfolk va", "[OPS]", ".*", "(A)+", "\\", "<b>"]) {
    const name = `COMMAND ${query} / ${query}`;
    const parts = commandMatchParts(name, query);
    assert.equal(parts.map((part) => part.text).join(""), name);
    assert.deepEqual(parts.filter((part) => part.match).map((part) => part.text), [query, query]);
  }
});

test("empty or unmatched queries do not highlight unrelated text", () => {
  for (const query of ["", "  ", "absent"]) assert.deepEqual(commandMatchParts("COMMAND", query), [{ text: "COMMAND", match: false }]);
});
