-- Preserve original mock IDs/documents while new template messages link to drafts.
CREATE TABLE messages (
    id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 100),
    draft_id uuid UNIQUE REFERENCES message_drafts(id) ON DELETE RESTRICT,
    created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
    request_id uuid,
    request_hash text,
    received_at timestamptz NOT NULL,
    record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (record->>'id' IS NOT NULL AND record->>'id' = id),
    CHECK ((draft_id IS NULL AND created_by IS NULL AND request_id IS NULL AND request_hash IS NULL)
        OR (draft_id IS NOT NULL AND created_by IS NOT NULL AND request_id IS NOT NULL
            AND request_hash IS NOT NULL AND request_hash ~ '^[0-9a-f]{64}$'
            AND record->>'kind' IS NOT NULL AND record->>'kind' = 'draft')),
    UNIQUE (created_by, request_id)
);
CREATE INDEX messages_received_idx ON messages (received_at DESC);
CREATE INDEX messages_creator_idx ON messages (created_by);
COMMENT ON TABLE messages IS 'API message feed: seeded fictional received records and private, untransmitted template drafts. No release/send behavior.';
