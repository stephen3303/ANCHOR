-- Branch compatibility, deliberately ordered before main's 004-message-store.
-- The first message-creation branch used the name "messages" for both draft
-- and feed records. Preserve that entire table before creating main's artifact
-- store. Main-only and fresh databases are unchanged by this migration.
DO $$
DECLARE item record;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='draft_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='c2oix_id') THEN
        ALTER TABLE messages RENAME TO legacy_message_creation_records;
        -- Explicit index names in main's migration need their original names.
        FOR item IN SELECT indexrelid::regclass::text AS name FROM pg_index WHERE indrelid='legacy_message_creation_records'::regclass LOOP
            EXECUTE format('ALTER INDEX %s RENAME TO %I', item.name, 'legacy_mc_' || replace(item.name, 'public.', ''));
        END LOOP;
    END IF;
END $$;
