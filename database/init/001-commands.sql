CREATE TABLE IF NOT EXISTS commands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE CHECK (length(btrim(name)) > 0)
);
