import "server-only";
import type { AppUser } from "@/lib/users";
import { isPendingTopic, PENDING_TOPIC_PREFIX, type MessageTopic } from "@/lib/message-topics";
import { MESSAGE_TYPES, messageKey, subtagsOf } from "@/lib/message-types";
import { UUID_PATTERN } from "@/lib/message-inputs";
import { ApiError } from "./api-error";
import { database } from "./db";

/** Every catalog type, then its subtags: all subscribable before any message exists. */
const SUBSCRIBABLE_KEYS = MESSAGE_TYPES.flatMap((type) => [type as string, ...subtagsOf(type).map((s) => messageKey(type, s.code))]);

/**
 * Every type a user can subscribe to, by its upper-case MSGID field 2 name:
 * every type and subtag in the catalog (so a type can be picked before any
 * message of it exists), each available template's type and its parent, and
 * every type already registered or on published traffic. A name with no topic
 * row yet carries a pending id; subscribing creates the row. Counts include
 * subtags under a parent, since a subscription to SAFETY catches them.
 */
const CATALOG = `
  WITH template_types AS (
    SELECT DISTINCT ON (t.id) t.name AS template, upper(btrim(f->>'fixedValue')) AS name
    FROM message_templates t
    JOIN message_template_versions v ON v.template_id = t.id AND v.published_at IS NOT NULL
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(v.ui_schema->'fields') = 'array' THEN v.ui_schema->'fields' ELSE '[]'::jsonb END) f
    WHERE t.active AND f->>'name' IN ('Type', 'Msg Type') AND nullif(btrim(f->>'fixedValue'), '') IS NOT NULL
    ORDER BY t.id, v.version DESC
  ), keyed AS (
    SELECT upper(t.name) AS name FROM message_topic_messages m JOIN message_topics t ON t.id = m.topic_id
  ), names AS (
    SELECT name FROM template_types
    UNION SELECT btrim(split_part(name, ':', 1)) FROM template_types WHERE position(':' IN name) > 1
    UNION SELECT upper(name) FROM message_topics
    UNION SELECT unnest($2::text[])
  )
  SELECT coalesce((SELECT t.id::text FROM message_topics t WHERE upper(t.name) = n.name ORDER BY t.name = n.name DESC, t.created_at, t.id LIMIT 1),
      '${PENDING_TOPIC_PREFIX}' || n.name) AS id, n.name,
    (SELECT count(*)::integer FROM keyed k WHERE k.name = n.name OR btrim(split_part(k.name, ':', 1)) = n.name) AS "messageCount",
    EXISTS (SELECT 1 FROM message_topic_subscriptions s JOIN message_topics t ON t.id = s.topic_id WHERE s.user_id = $1 AND upper(t.name) = n.name) AS subscribed,
    coalesce((SELECT array_agg(tt.template ORDER BY lower(tt.template)) FROM template_types tt WHERE tt.name = n.name), '{}') AS templates
  FROM names n WHERE n.name <> ''
  ORDER BY n.name`;

export async function listMessageTopics(user: AppUser): Promise<MessageTopic[]> {
  const { rows } = await database().query<MessageTopic>(CATALOG, [user.id, SUBSCRIBABLE_KEYS]);
  return rows;
}

/** Subscribe by the Type name of an available template, creating its topic on first use. */
export async function subscribeToTopicName(user: AppUser, name: unknown) {
  if (typeof name !== "string" || !name.trim() || name.length > 200 || /[\r\n\0]/.test(name)) throw new ApiError(400, "Invalid message type.");
  const topic = (await listMessageTopics(user)).find((entry) => entry.name === name.trim().toUpperCase());
  if (!topic) throw new ApiError(404, "No catalog type, available template or published message uses that type.");
  if (isPendingTopic(topic.id)) await database().query("INSERT INTO message_topics(name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [topic.name]);
  const { rows: [row] } = await database().query<{ id: string }>("SELECT id FROM message_topics WHERE upper(name)=$1 ORDER BY name=$1 DESC, created_at, id LIMIT 1", [topic.name]);
  await database().query("INSERT INTO message_topic_subscriptions(user_id,topic_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [user.id, row.id]);
  return { id: row.id, previousId: topic.id, subscribed: true };
}

export async function setMessageTopicSubscription(user: AppUser, id: string, subscribed: boolean) {
  if (!UUID_PATTERN.test(id)) throw new ApiError(400, "Invalid message type ID.");
  const { rows: [topic] } = await database().query("SELECT id FROM message_topics WHERE id=$1", [id]);
  if (!topic) throw new ApiError(404, "Subscription type not found.");
  if (subscribed) {
    await database().query("INSERT INTO message_topic_subscriptions(user_id,topic_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [user.id, id]);
  } else {
    // Names compare in upper case, so drop every spelling of the same type.
    await database().query(`DELETE FROM message_topic_subscriptions WHERE user_id=$1 AND topic_id IN (
      SELECT o.id FROM message_topics o JOIN message_topics t ON upper(o.name) = upper(t.name) WHERE t.id=$2)`, [user.id, id]);
  }
  return { id: topic.id, subscribed };
}
