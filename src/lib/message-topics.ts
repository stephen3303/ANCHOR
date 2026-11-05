import type { Message } from "./types";

/** Topic names are exact, author-defined Type values, not workflow categories. */
export interface MessageTopic {
  id: string;
  name: string;
  messageCount: number;
  subscribed: boolean;
}

export function subscribedMessages(messages: Message[], topics: readonly MessageTopic[]): Message[] {
  const ids = new Set(topics.filter((topic) => topic.subscribed).map((topic) => topic.id));
  return messages.filter((message) => !!message.subscriptionTopicId && ids.has(message.subscriptionTopicId));
}
