-- ExoSkull v2 Foundation — 8 tables, indexes, RLS, helper functions
-- Philosophy: 8 tables with JSONB > 60 tables with rigid schemas

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- 1. TENANTS — identity, settings, personality, permissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE,
  name TEXT,
  email TEXT,
  phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  settings JSONB NOT NULL DEFAULT '{}',
  channel_ids JSONB NOT NULL DEFAULT '{}',
  autonomy_grants JSONB NOT NULL DEFAULT '{}',
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_auth ON tenants(auth_id);
CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own tenant" ON tenants
    FOR SELECT USING (auth_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users update own tenant" ON tenants
    FOR UPDATE USING (auth_id = auth.uid()) WITH CHECK (auth_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access tenants" ON tenants
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. EVENTS — append-only event log (event-sourced state)
-- ============================================================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id UUID,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  data JSONB NOT NULL,
  channel TEXT DEFAULT 'web_chat',
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_cents NUMERIC(10,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_events_tenant_session ON events(tenant_id, session_id, seq);
CREATE INDEX IF NOT EXISTS idx_events_tenant_time ON events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind, created_at);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own events" ON events
    FOR SELECT USING (tenant_id IN (SELECT id FROM tenants WHERE auth_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access events" ON events
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 3. MEMORY — unified memory (facts, episodes, notes, entities, summaries)
-- ============================================================================
CREATE TABLE IF NOT EXISTS memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  importance REAL NOT NULL DEFAULT 0.5,
  source JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  accessed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_tenant_kind ON memory(tenant_id, kind);
CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory(tenant_id, importance DESC);
CREATE INDEX IF NOT EXISTS idx_memory_embedding ON memory USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

ALTER TABLE memory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own memory" ON memory
    FOR SELECT USING (tenant_id IN (SELECT id FROM tenants WHERE auth_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access memory" ON memory
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Vector search function
CREATE OR REPLACE FUNCTION search_memory(
  p_tenant_id UUID,
  p_embedding vector(1536),
  p_limit INT DEFAULT 10,
  p_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE(id UUID, kind TEXT, content TEXT, importance REAL, similarity FLOAT, metadata JSONB)
LANGUAGE sql STABLE
AS $$
  SELECT m.id, m.kind, m.content, m.importance,
    1 - (m.embedding <=> p_embedding) AS similarity,
    m.metadata
  FROM memory m
  WHERE m.tenant_id = p_tenant_id
    AND m.embedding IS NOT NULL
    AND (m.expires_at IS NULL OR m.expires_at > now())
    AND 1 - (m.embedding <=> p_embedding) >= p_threshold
  ORDER BY m.embedding <=> p_embedding
  LIMIT p_limit;
$$;

-- ============================================================================
-- 4. GOALS — hierarchical self-referential tree
-- ============================================================================
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  progress REAL NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 5,
  strategy JSONB,
  metrics JSONB,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_tenant_status ON goals(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_tenant_depth ON goals(tenant_id, depth, priority DESC);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own goals" ON goals
    FOR SELECT USING (tenant_id IN (SELECT id FROM tenants WHERE auth_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users mutate own goals" ON goals
    FOR ALL USING (tenant_id IN (SELECT id FROM tenants WHERE auth_id = auth.uid()))
    WITH CHECK (tenant_id IN (SELECT id FROM tenants WHERE auth_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access goals" ON goals
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 5. TOOLS — dynamic tool registry
-- ============================================================================
CREATE TABLE IF NOT EXISTS tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'tool',
  schema JSONB NOT NULL,
  handler TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_tools_tenant_enabled ON tools(tenant_id, enabled);
CREATE INDEX IF NOT EXISTS idx_tools_slug ON tools(slug);

ALTER TABLE tools ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own tools" ON tools
    FOR SELECT USING (
      tenant_id IS NULL OR
      tenant_id IN (SELECT id FROM tenants WHERE auth_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access tools" ON tools
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 6. QUEUE — unified work queue (replaces 43 CRONs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  claimed_by TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  recurrence TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queue_claimable ON queue(tenant_id, status, priority DESC, scheduled_for)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_queue_tenant_status ON queue(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_scheduled ON queue(scheduled_for) WHERE status = 'pending';

ALTER TABLE queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access queue" ON queue
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Atomic claim function — FOR UPDATE SKIP LOCKED prevents race conditions
CREATE OR REPLACE FUNCTION claim_queue_item(p_kinds TEXT[] DEFAULT NULL)
RETURNS SETOF queue
LANGUAGE sql
AS $$
  UPDATE queue
  SET status = 'claimed', claimed_by = current_setting('request.jwt.claims', true)::jsonb->>'sub'
  WHERE id = (
    SELECT id FROM queue
    WHERE status = 'pending'
      AND scheduled_for <= now()
      AND (p_kinds IS NULL OR kind = ANY(p_kinds))
    ORDER BY priority DESC, scheduled_for ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- ============================================================================
-- 7. CONNECTIONS — external integrations
-- ============================================================================
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'oauth',
  credentials JSONB NOT NULL DEFAULT '{}',
  scopes TEXT[],
  sync_status TEXT NOT NULL DEFAULT 'idle',
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_connections_tenant ON connections(tenant_id);

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own connections" ON connections
    FOR SELECT USING (tenant_id IN (SELECT id FROM tenants WHERE auth_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access connections" ON connections
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 8. BLOBS — file storage metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS blobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  storage_path TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  extracted_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blobs_tenant_kind ON blobs(tenant_id, kind);

ALTER TABLE blobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own blobs" ON blobs
    FOR SELECT USING (tenant_id IN (SELECT id FROM tenants WHERE auth_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access blobs" ON blobs
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- HELPER: Auto-update updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenants_updated_at ON tenants;
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS goals_updated_at ON goals;
CREATE TRIGGER goals_updated_at BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- HELPER: Get or create tenant from auth.uid()
-- ============================================================================
CREATE OR REPLACE FUNCTION get_or_create_tenant(p_auth_id UUID, p_email TEXT DEFAULT NULL, p_name TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE auth_id = p_auth_id;
  IF v_tenant_id IS NULL THEN
    INSERT INTO tenants (auth_id, email, name)
    VALUES (p_auth_id, p_email, p_name)
    RETURNING id INTO v_tenant_id;
  END IF;
  RETURN v_tenant_id;
END;
$$;

-- ============================================================================
-- HELPER: Next event sequence number
-- ============================================================================
CREATE OR REPLACE FUNCTION next_event_seq(p_session_id UUID)
RETURNS INTEGER
LANGUAGE sql
AS $$
  SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE session_id = p_session_id;
$$;
