CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intake JSONB NOT NULL DEFAULT '{}'::jsonb,
    intake_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);


CREATE TABLE IF NOT EXISTS interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL
        REFERENCES workspaces(id) ON DELETE CASCADE,

    intake_version INTEGER NOT NULL,
    intake_snapshot JSONB NOT NULL,

    status TEXT NOT NULL DEFAULT 'not_started',
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    feedback JSONB,

    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS interviews_workspace_idx
    ON interviews (workspace_id, created_at DESC);


CREATE TABLE IF NOT EXISTS artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL
        REFERENCES workspaces(id) ON DELETE CASCADE,

    kind TEXT NOT NULL,
    intake_version INTEGER NOT NULL,

    output JSONB NOT NULL,
    sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS artifacts_lookup_idx
    ON artifacts (
        workspace_id,
        kind,
        intake_version,
        created_at DESC
    );