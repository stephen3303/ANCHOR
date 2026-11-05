import assert from "node:assert/strict";
import { test } from "node:test";
import { subscribedMessages, subscriptionKey, type MessageTopic } from "./message-topics";
import type { Message } from "./types";

const topics: MessageTopic[] = [
  { id: "alpha", name: "REPORT", subscribed: true, messageCount: 2 },
  { id: "gamma", name: "OTHER", subscribed: false, messageCount: 1 },
];
const messages = [
  { id: "first", type: "GENADMIN", subscriptionTopicId: "alpha", subscriptionType: "REPORT" },
  { id: "second", type: "GENADMIN", subscriptionTopicId: "gamma", subscriptionType: "OTHER" },
  { id: "third", type: "NAVADMIN", subscriptionTopicId: "alpha", subscriptionType: "REPORT" },
] as Message[];

test("subscriptions match the message's published type, not its workflow category", () => {
  assert.deepEqual(subscribedMessages(messages, topics).map((message) => message.id), ["first", "third"]);
  assert.equal(messages.length, 3, "Filtering does not change All Messages");
});
test("no subscriptions never fall back to all traffic", () => {
  assert.deepEqual(subscribedMessages(messages, []), []);
  assert.deepEqual(subscribedMessages(messages, topics.map((topic) => ({ ...topic, subscribed: false }))), []);
});
test("unsubscribe removes prior matching messages; subscribing includes older messages", () => {
  assert.deepEqual(subscribedMessages(messages, topics.map((topic) => ({ ...topic, subscribed: topic.id === "gamma" }))).map((message) => message.id), ["second"]);
});
test("types compare in upper case", () => {
  const lower = [{ id: "l", type: "GENADMIN", subscriptionType: "report" }] as Message[];
  assert.deepEqual(subscribedMessages(lower, [{ id: "x", name: "Report", subscribed: true, messageCount: 0 }]).map((m) => m.id), ["l"]);
});
test("subscribing to a type catches its subtags, but a subtag does not catch its type", () => {
  const typed: MessageTopic[] = [
    { id: "safety", name: "SAFETY", subscribed: true, messageCount: 1 },
    { id: "electrical", name: "SAFETY:ELECTRICAL", subscribed: false, messageCount: 1 },
    { id: "safetyish", name: "SAFETYGRAM", subscribed: false, messageCount: 1 },
  ];
  const traffic = [
    { id: "s", type: "SAFETY", subscriptionType: "SAFETY" },
    { id: "e", type: "SAFETY", subtag: "ELECTRICAL", subscriptionType: "SAFETY:ELECTRICAL" },
    { id: "g", type: "GENADMIN", subscriptionType: "SAFETYGRAM" },
  ] as Message[];
  assert.deepEqual(subscribedMessages(traffic, typed).map((m) => m.id), ["s", "e"]);
  const subOnly = typed.map((t) => ({ ...t, subscribed: t.id === "electrical" }));
  assert.deepEqual(subscribedMessages(traffic, subOnly).map((m) => m.id), ["e"]);
});
test("simulator traffic the server never stored is matched by its MSGID type", () => {
  const sim = [{ id: "sim-1", type: "CASREP" }, { id: "sim-2", type: "SAFETY", subtag: "ELECTRICAL" }] as Message[];
  assert.equal(subscriptionKey(sim[1]), "SAFETY:ELECTRICAL");
  const subs: MessageTopic[] = [{ id: "type:SAFETY", name: "SAFETY", subscribed: true, messageCount: 0 }];
  assert.deepEqual(subscribedMessages(sim, subs).map((m) => m.id), ["sim-2"]);
});
