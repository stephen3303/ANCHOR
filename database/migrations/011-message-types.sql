-- Message types are the MSGID set's field 2, and topic types carry a subtag in
-- the same field after a colon (MSGID/SAFETY:ELECTRICAL/...). The type is the subscription key and
-- names the template that drafts it (the template's fixed Type value). This replaces the earlier drafting labels
-- and free-form topic tags.
--
-- Released records (local releases, published drafts) are immutable and keep
-- whatever they were released with; the app shows an unknown type as written.

-- Received and local messages. Their raw text is the official record and says
-- GENADMIN for the old COMSUBLANT MSG / FLEET MSG / SAFETY MSG labels.
UPDATE messages
SET record = jsonb_set(record - 'topics' - 'communities', '{type}',
    CASE WHEN record->>'type' IN ('COMSUBLANT MSG', 'FLEET MSG', 'SAFETY MSG') THEN '"GENADMIN"' ELSE record->'type' END)
WHERE coalesce(record->>'kind', '') <> 'released'
  AND (record ? 'topics' OR record ? 'communities' OR record->>'type' IN ('COMSUBLANT MSG', 'FLEET MSG', 'SAFETY MSG'));

-- Drafts in progress and routing: map each old drafting label to the type its
-- workflow now matches, so chains and release scopes keep catching the same drafts.
CREATE FUNCTION pg_temp.anchor_type_009(label text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE label
        WHEN 'COMSUBLANT MSG' THEN 'GENADMIN'
        WHEN 'FLEET MSG' THEN 'LOGISTICS'
        WHEN 'SAFETY MSG' THEN 'SAFETY'
        WHEN 'COMSUBFOR INST' THEN 'GENADMIN'
        ELSE label END
$$;
CREATE FUNCTION pg_temp.anchor_types_009(list jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(jsonb_agg(DISTINCT pg_temp.anchor_type_009(value)), '[]'::jsonb)
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(list) = 'array' THEN list ELSE '[]'::jsonb END)
$$;

UPDATE outgoing_messages
SET record = jsonb_set(record - 'communities' - 'topics', '{type}', to_jsonb(pg_temp.anchor_type_009(record->>'type')))
WHERE workflow_status <> 'released'
  AND (record ? 'communities' OR record ? 'topics' OR record->>'type' <> pg_temp.anchor_type_009(record->>'type'));

UPDATE message_drafts d
SET message_type = pg_temp.anchor_type_009(d.message_type)
WHERE d.message_type <> pg_temp.anchor_type_009(d.message_type)
  AND NOT EXISTS (SELECT 1 FROM outgoing_messages o WHERE o.draft_id = d.id AND o.workflow_status = 'released');

UPDATE command_routing
SET workflows = (SELECT coalesce(jsonb_agg(
        CASE WHEN w ? 'matchTypes' THEN jsonb_set(w - 'matchOffices', '{matchTypes}', pg_temp.anchor_types_009(w->'matchTypes')) ELSE w - 'matchOffices' END
        ORDER BY position), '[]'::jsonb)
        FROM jsonb_array_elements(workflows) WITH ORDINALITY AS list(w, position)),
    authorities = (SELECT coalesce(jsonb_agg(
        CASE WHEN a ? 'scope' THEN jsonb_set(a - 'offices', '{scope}', pg_temp.anchor_types_009(a->'scope')) ELSE a - 'offices' END
        ORDER BY position), '[]'::jsonb)
        FROM jsonb_array_elements(authorities) WITH ORDINALITY AS list(a, position)),
    revision = revision + 1;
