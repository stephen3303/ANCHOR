import assert from "node:assert/strict";
import { test } from "node:test";
import { subscribedMessages, type MessageTopic } from "./message-topics";
import type { Message } from "./types";

const topics: MessageTopic[] = [
  { id: "alpha", name: "REPORT", subscribed: true, messageCount: 2 },
  { id: "beta", name: "report", subscribed: false, messageCount: 1 },
];
const messages = [
  { id: "first", type: "COMSUBLANT MSG", subscriptionTopicId: "alpha" },
  { id: "second", type: "COMSUBLANT MSG", subscriptionTopicId: "beta" },
  { id: "legacy", type: "COMSUBLANT MSG" },
  { id: "third", type: "NAVADMIN", subscriptionTopicId: "alpha" },
] as Message[];

test("subscriptions match exact topic IDs rather than workflow categories or similar names", () => {
  assert.deepEqual(subscribedMessages(messages, topics).map((message) => message.id), ["first", "third"]);
  assert.equal(messages.length, 4, "Filtering does not change All Messages");
});
test("no subscriptions, unknown topics and untyped/demo messages never fall back to all traffic", () => {
  assert.deepEqual(subscribedMessages(messages, []), []);
  assert.deepEqual(subscribedMessages(messages, topics.map((topic) => ({ ...topic, subscribed: false }))), []);
});
test("unsubscribe removes prior matching messages; subscribing includes older messages", () => {
  assert.deepEqual(subscribedMessages(messages, topics.map((topic) => ({ ...topic, subscribed: topic.id === "beta" }))).map((message) => message.id), ["second"]);
});
