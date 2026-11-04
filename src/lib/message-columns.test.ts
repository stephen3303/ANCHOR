import assert from "node:assert/strict";
import { test } from "node:test";
import { MESSAGE_COLUMN_LABELS, MESSAGE_COLUMN_ORDER, orderMessageColumns } from "./message-columns";

test("the Messages page columns come first, in the Messages page order", () => {
  const messagesPage = ["select", "attachments", "subject", "reference", "from", "dtg", "precedence", "status"] as const;
  assert.deepEqual(MESSAGE_COLUMN_ORDER.filter((c) => (messagesPage as readonly string[]).includes(c)), [...messagesPage]);
});

test("a subset keeps the canonical relative order whatever order it is listed in", () => {
  assert.deepEqual(orderMessageColumns(["status", "precedence", "subject", "reference"]), ["subject", "reference", "precedence", "status"]);
  assert.deepEqual(orderMessageColumns(["classification", "dtg", "subject", "precedence", "reference"]), ["subject", "reference", "dtg", "precedence", "classification"]);
});

test("status is always the last column", () => {
  assert.equal(MESSAGE_COLUMN_ORDER.at(-1), "status");
});

test("every column has a label and no column is listed twice", () => {
  assert.equal(new Set(MESSAGE_COLUMN_ORDER).size, MESSAGE_COLUMN_ORDER.length);
  for (const c of MESSAGE_COLUMN_ORDER) assert.ok(MESSAGE_COLUMN_LABELS[c]);
});
