import assert from "node:assert/strict";
import { test } from "node:test";
import { exampleType, LIFECYCLE_EXAMPLES, LIFECYCLE_STAGES, STANDARD_TEMPLATE } from "./lifecycle-examples";
import { DRAFT_KEYS } from "./message-types";
import { DEMO_USERS } from "./demo-users";

test("lifecycle examples cover every stage with stable, unique keys", () => {
  const keys = LIFECYCLE_EXAMPLES.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const stage of LIFECYCLE_STAGES) assert.ok(LIFECYCLE_EXAMPLES.some((e) => e.stage === stage), `no ${stage} example`);
});

test("each example carries its real draftable type, never GENADMIN", () => {
  for (const e of LIFECYCLE_EXAMPLES) {
    const type = exampleType(e);
    assert.notEqual(type, "GENADMIN", e.key);
    assert.ok(DRAFT_KEYS.includes(type), `${e.key}: ${type} is not a draftable type`);
    // A typed template's name is its type; only Standard Message takes the type as input.
    if (e.template !== STANDARD_TEMPLATE) assert.equal(e.type, e.template, e.key);
  }
  assert.ok(new Set(LIFECYCLE_EXAMPLES.map(exampleType)).size >= 8, "spread the examples across types");
});

test("drafters are demo accounts, and each step lands at a distinct minute", () => {
  const logins = new Set(DEMO_USERS.map((u) => u.login));
  for (const e of LIFECYCLE_EXAMPLES) assert.ok(logins.has(e.drafter), `${e.key}: unknown drafter ${e.drafter}`);
  // Released messages are referenced by sender and DTG, so no two may release in the same minute.
  const starts = LIFECYCLE_EXAMPLES.map((e) => e.hoursAgo * 60);
  assert.equal(new Set(starts).size, starts.length, "start every example at its own hour");
  for (const e of LIFECYCLE_EXAMPLES) if (e.stage === "returned") assert.ok(e.returnComment, e.key);
});
