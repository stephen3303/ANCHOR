import { keyCovers } from "./message-types";
import type { Message } from "./types";

/** Id of a template's Type that has no topic row yet; subscribing creates it. */
export const PENDING_TOPIC_PREFIX = "type:";
export const isPendingTopic = (id: string) => id.startsWith(PENDING_TOPIC_PREFIX);

/** Topic names are exact, author-defined Type values, not workflow categories. */
export interface MessageTopic {
  id: string;
  name: string;
  messageCount: number;
  subscribed: boolean;
  /** Available templates whose Type this is; empty for traffic-only types. */
  templates?: string[];
}

/**
 * A message is in the feed when its own topic is subscribed, or when a
 * subscribed topic is its type alone: SAFETY catches SAFETY:ELECTRICAL
 * (MSGID field 2, type:subtag). Names compare exactly, so case still matters.
 */
export function subscribedMessages(messages: Message[], topics: readonly MessageTopic[]): Message[] {
  const subscribed = topics.filter((topic) => topic.subscribed);
  const ids = new Set(subscribed.map((topic) => topic.id));
  const names = topics.reduce((map, topic) => map.set(topic.id, topic.name), new Map<string, string>());
  return messages.filter((message) => {
    if (!message.subscriptionTopicId) return false;
    if (ids.has(message.subscriptionTopicId)) return true;
    const name = names.get(message.subscriptionTopicId) ?? message.subscriptionType;
    return !!name && subscribed.some((topic) => keyCovers(topic.name, name));
  });
}
