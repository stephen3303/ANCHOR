CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    login text NOT NULL UNIQUE CHECK (btrim(login) <> ''),
    name text NOT NULL CHECK (btrim(name) <> ''),
    command_id uuid NOT NULL REFERENCES commands(id) ON DELETE RESTRICT,
    -- The seed preserves CURRENT_USER's full display profile separately from
    -- the directory command name used for generated message text.
    profile jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(profile) = 'object'),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_login_case_insensitive ON users (lower(login));
CREATE INDEX users_command_idx ON users (command_id);
CREATE TRIGGER users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CHECK (expires_at > created_at)
);
CREATE INDEX user_sessions_user_idx ON user_sessions (user_id);
CREATE INDEX user_sessions_expiry_idx ON user_sessions (expires_at);
COMMENT ON TABLE user_sessions IS
    'Passwordless hackathon account selection, not identity verification. Only SHA-256 token hashes are stored.';
