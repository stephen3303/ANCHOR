import "server-only";
import type { AppUser } from "@/lib/users";
import type { MessageTopic } from "@/lib/message-topics";
import { UUID_PATTERN } from "@/lib/message-inputs";
import { ApiError } from "./api-error";
import { database } from "./db";

export async function listMessageTopics(user: AppUser): Promise<MessageTopic[]> {
  const { rows } = await database().query<MessageTopic>(`
    WITH template_types AS (
      -- Name the active templates whose latest published version drafts each Type.
      SELECT t.name AS template, template_message_topic(v.ui_schema) AS name
      FROM message_templates t
      JOIN LATERAL (SELECT ui_schema FROM message_template_versions WHERE template_id=t.id AND published_at IS NOT NULL
        ORDER BY version DESC LIMIT 1) v ON true
      WHERE t.active
    )
    SELECT t.id, t.name, (SELECT count(*)::integer FROM message_topic_messages m WHERE m.topic_id=t.id) AS "messageCount",
      EXISTS (SELECT 1 FROM message_topic_subscriptions s WHERE s.topic_id=t.id AND s.user_id=$1) AS subscribed,
      coalesce((SELECT array_agg(tt.template ORDER BY lower(tt.template)) FROM template_types tt WHERE tt.name=t.name), '{}') AS templates
    FROM message_topics t ORDER BY lower(t.name), t.name`, [user.id]);
  return rows;
}

export async function setMessageTopicSubscription(user: AppUser, id: string, subscribed: boolean) {
  if (!UUID_PATTERN.test(id)) throw new ApiError(400, "Invalid message type ID.");
  const { rows: [topic] } = await database().query("SELECT id FROM message_topics WHERE id=$1", [id]);
  if (!topic) throw new ApiError(404, "Subscription type not found.");
  if (subscribed) {
    await database().query("INSERT INTO message_topic_subscriptions(user_id,topic_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [user.id, id]);
  } else {
    await database().query("DELETE FROM message_topic_subscriptions WHERE user_id=$1 AND topic_id=$2", [user.id, id]);
  }
  return { id: topic.id, subscribed };
}
