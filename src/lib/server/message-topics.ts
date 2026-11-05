import "server-only";
import type { AppUser } from "@/lib/users";
import type { MessageTopic } from "@/lib/message-topics";
import { UUID_PATTERN } from "@/lib/message-inputs";
import { ApiError } from "./api-error";
import { database } from "./db";

export async function listMessageTopics(user: AppUser): Promise<MessageTopic[]> {
  const { rows } = await database().query<MessageTopic>(`
    SELECT t.id, t.name, count(m.message_id)::integer AS "messageCount",
      EXISTS (SELECT 1 FROM message_topic_subscriptions s WHERE s.topic_id=t.id AND s.user_id=$1) AS subscribed
    FROM message_topics t JOIN message_topic_messages m ON m.topic_id=t.id
    GROUP BY t.id ORDER BY lower(t.name), t.name`, [user.id]);
  return rows;
}

export async function setMessageTopicSubscription(user: AppUser, id: string, subscribed: boolean) {
  if (!UUID_PATTERN.test(id)) throw new ApiError(400, "Invalid message type ID.");
  const { rows: [topic] } = await database().query("SELECT id FROM message_topics WHERE id=$1", [id]);
  if (!topic) throw new ApiError(404, "Published message type not found.");
  if (subscribed) {
    await database().query("INSERT INTO message_topic_subscriptions(user_id,topic_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [user.id, id]);
  } else {
    await database().query("DELETE FROM message_topic_subscriptions WHERE user_id=$1 AND topic_id=$2", [user.id, id]);
  }
  return { id: topic.id, subscribed };
}
