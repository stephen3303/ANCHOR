import "server-only";
import type { AppUser } from "@/lib/users";
import { PENDING_TOPIC_PREFIX, type MessageTopic } from "@/lib/message-topics";
import { UUID_PATTERN } from "@/lib/message-inputs";
import { ApiError } from "./api-error";
import { database } from "./db";

/**
 * Every Type a user can subscribe to: each available (active, published)
 * template's author-fixed Type, the parent type of a TYPE:SUBTAG Type (which
 * catches all its subtags), and every Type already on published traffic. A
 * template's Type has no topic row until someone subscribes or a message is
 * published, so those entries carry a pending id until then.
 */
const CATALOG = `
  WITH template_types AS (
    SELECT DISTINCT ON (t.id) t.name AS template, btrim(f->>'fixedValue') AS name
    FROM message_templates t
    JOIN message_template_versions v ON v.template_id = t.id AND v.published_at IS NOT NULL
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(v.ui_schema->'fields') = 'array' THEN v.ui_schema->'fields' ELSE '[]'::jsonb END) f
    WHERE t.active AND f->>'name' IN ('Type', 'Msg Type') AND nullif(btrim(f->>'fixedValue'), '') IS NOT NULL
    ORDER BY t.id, v.version DESC
  ), names AS (
    SELECT name FROM template_types
    UNION SELECT btrim(split_part(name, ':', 1)) FROM template_types WHERE position(':' IN name) > 1
    UNION SELECT t.name FROM message_topics t JOIN message_topic_messages m ON m.topic_id = t.id
  )
  SELECT coalesce(t.id::text, '${PENDING_TOPIC_PREFIX}' || n.name) AS id, n.name,
    (SELECT count(*)::integer FROM message_topic_messages m WHERE m.topic_id = t.id) AS "messageCount",
    EXISTS (SELECT 1 FROM message_topic_subscriptions s WHERE s.topic_id = t.id AND s.user_id = $1) AS subscribed,
    coalesce((SELECT array_agg(tt.template ORDER BY lower(tt.template)) FROM template_types tt WHERE tt.name = n.name), '{}') AS templates
  FROM names n LEFT JOIN message_topics t ON t.name = n.name
  ORDER BY lower(n.name), n.name`;

export async function listMessageTopics(user: AppUser): Promise<MessageTopic[]> {
  const { rows } = await database().query<MessageTopic>(CATALOG, [user.id]);
  return rows;
}

/** Subscribe by the Type name of an available template, creating its topic on first use. */
export async function subscribeToTopicName(user: AppUser, name: unknown) {
  if (typeof name !== "string" || !name.trim() || name.length > 200 || /[\r\n\0]/.test(name)) throw new ApiError(400, "Invalid message type.");
  const topic = (await listMessageTopics(user)).find((entry) => entry.name === name.trim());
  if (!topic) throw new ApiError(404, "No available template or published message uses that type.");
  await database().query("INSERT INTO message_topics(name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [topic.name]);
  const { rows: [row] } = await database().query<{ id: string }>("SELECT id FROM message_topics WHERE name=$1", [topic.name]);
  await database().query("INSERT INTO message_topic_subscriptions(user_id,topic_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [user.id, row.id]);
  return { id: row.id, previousId: topic.id, subscribed: true };
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
