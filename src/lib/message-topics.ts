import { keyCovers, keyOf } from "./message-types";
import type { Message } from "./types";

/** Id of a template's Type that has no topic row yet; subscribing creates it. */
export const PENDING_TOPIC_PREFIX = "type:";
export const isPendingTopic = (id: string) => id.startsWith(PENDING_TOPIC_PREFIX);

/** Topic names are upper-case MSGID field 2 types, not workflow categories. */
export interface MessageTopic {
  id: string;
  name: string;
  messageCount: number;
  subscribed: boolean;
  /** Available templates whose Type this is; empty for traffic-only types. */
  templates?: string[];
}

/**
 * The type a message is filed under for subscriptions: the published Type the
 * server registered for it, or, for traffic the server never stored (simulator
 * messages), the MSGID field 2 read from its text. Always upper case.
 */
export const subscriptionKey = (message: Message) => (message.subscriptionType ?? keyOf(message)).toUpperCase();

/**
 * A message is in the feed when a subscribed type is its type, or its type
 * alone: SAFETY catches SAFETY:ELECTRICAL (MSGID field 2, TYPE:SUBTAG).
 * Types compare in upper case.
 */
export function subscribedMessages(messages: Message[], topics: readonly MessageTopic[]): Message[] {
  const subscribed = topics.filter((topic) => topic.subscribed).map((topic) => topic.name.toUpperCase());
  if (!subscribed.length) return [];
  return messages.filter((message) => {
    const key = subscriptionKey(message);
    return subscribed.some((name) => keyCovers(name, key));
  });
}
