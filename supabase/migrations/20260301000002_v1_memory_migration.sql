-- ExoSkull v1 → v2 Memory Migration
-- Both v1 and v2 share the same Supabase project (uvupnwvkzreikurymncs)
-- v1 tenant IDs: be769cc4-43db-4b26-bcc2-046c6653e3b3 AND 4538e7b5-6705-4084-b351-536b34b26067
-- v2 tenant ID: 8acc86f6-72bb-4b9c-8d93-4308691c753c
-- This is an intra-database migration — no ETL needed.

DO $$
DECLARE
  v2_tenant UUID := '8acc86f6-72bb-4b9c-8d93-4308691c753c';
  v1_tenant_a UUID := 'be769cc4-43db-4b26-bcc2-046c6653e3b3';
  v1_tenant_b UUID := '4538e7b5-6705-4084-b351-536b34b26067';
  migrated INT;
BEGIN

  -- ══════════════════════════════════════════════════════════════
  -- 1. DOCUMENTS → blobs (255 rows)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO blobs (id, tenant_id, kind, filename, mime_type, size_bytes, storage_path, processing_status, extracted_text, metadata, created_at)
  SELECT
    d.id,
    v2_tenant,
    CASE
      WHEN d.file_type IN ('pdf','docx','doc','txt','md','csv','xlsx','xls','pptx') THEN 'document'
      WHEN d.file_type IN ('png','jpg','jpeg','gif','webp','svg') THEN 'image'
      WHEN d.file_type IN ('mp3','wav','ogg','m4a','webm') THEN 'audio'
      ELSE 'document'
    END,
    COALESCE(d.original_name, d.filename),
    CASE d.file_type
      WHEN 'pdf' THEN 'application/pdf'
      WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      WHEN 'txt' THEN 'text/plain'
      WHEN 'md' THEN 'text/markdown'
      WHEN 'csv' THEN 'text/csv'
      WHEN 'xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      WHEN 'png' THEN 'image/png'
      WHEN 'jpg' THEN 'image/jpeg'
      ELSE 'application/octet-stream'
    END,
    d.file_size,
    COALESCE(d.storage_path, d.filename),
    CASE WHEN d.extracted_text IS NOT NULL THEN 'completed' ELSE 'pending' END,
    LEFT(d.extracted_text, 50000),
    jsonb_build_object(
      'v1_table', 'exo_user_documents',
      'v1_id', d.id,
      'original_name', d.original_name,
      'file_type', d.file_type
    ),
    d.created_at
  FROM exo_user_documents d
  WHERE d.tenant_id IN (v1_tenant_a, v1_tenant_b)
    AND NOT EXISTS (SELECT 1 FROM blobs b WHERE b.id = d.id);
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % documents → blobs', migrated;

  -- ══════════════════════════════════════════════════════════════
  -- 2. DOCUMENT CHUNKS → memory (28,663 rows) — with embeddings!
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO memory (id, tenant_id, kind, content, embedding, importance, source, metadata, created_at)
  SELECT
    c.id,
    v2_tenant,
    'document',
    c.content,
    c.embedding,
    0.6,
    jsonb_build_object(
      'v1_table', 'exo_document_chunks',
      'document_id', c.document_id,
      'chunk_index', c.chunk_index,
      'type', 'v1_migration'
    ),
    jsonb_build_object('chunk_index', c.chunk_index, 'document_id', c.document_id),
    c.created_at
  FROM exo_document_chunks c
  JOIN exo_user_documents d ON d.id = c.document_id
  WHERE d.tenant_id IN (v1_tenant_a, v1_tenant_b)
    AND NOT EXISTS (SELECT 1 FROM memory m WHERE m.id = c.id);
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % document chunks → memory', migrated;

  -- ══════════════════════════════════════════════════════════════
  -- 3. KNOWLEDGE ENTITIES → memory (15 rows)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO memory (id, tenant_id, kind, content, embedding, importance, source, metadata, created_at)
  SELECT
    e.id,
    v2_tenant,
    'entity',
    e.name || ': ' || COALESCE(e.description, '') || CASE WHEN e.aliases IS NOT NULL THEN ' (aliases: ' || array_to_string(e.aliases, ', ') || ')' ELSE '' END,
    e.embedding,
    COALESCE(e.importance, 0.7),
    jsonb_build_object('v1_table', 'exo_knowledge_entities', 'type', e.type),
    COALESCE(e.properties, '{}')::jsonb || jsonb_build_object('entity_type', e.type, 'mention_count', e.mention_count),
    e.created_at
  FROM exo_knowledge_entities e
  WHERE e.tenant_id IN (v1_tenant_a, v1_tenant_b)
    AND NOT EXISTS (SELECT 1 FROM memory m WHERE m.id = e.id);
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % knowledge entities → memory', migrated;

  -- ══════════════════════════════════════════════════════════════
  -- 4. VECTOR EMBEDDINGS → memory (43 rows)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO memory (tenant_id, kind, content, embedding, importance, source, metadata, created_at)
  SELECT
    v2_tenant,
    COALESCE(v.source_type, 'fact'),
    v.content,
    v.embedding,
    0.7,
    jsonb_build_object('v1_table', 'exo_vector_embeddings', 'v1_id', v.id),
    COALESCE(v.metadata, '{}')::jsonb,
    v.created_at
  FROM exo_vector_embeddings v
  WHERE v.tenant_id IN (v1_tenant_a, v1_tenant_b);
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % vector embeddings → memory', migrated;

  -- ══════════════════════════════════════════════════════════════
  -- 5. DAILY SUMMARIES → memory (18 rows)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO memory (id, tenant_id, kind, content, embedding, importance, source, metadata, created_at)
  SELECT
    s.id,
    v2_tenant,
    'summary',
    COALESCE(s.final_summary, s.draft_summary),
    s.embedding,
    0.6,
    jsonb_build_object('v1_table', 'exo_daily_summaries', 'date', s.summary_date),
    jsonb_build_object('summary_date', s.summary_date, 'message_count', s.message_count, 'mood_score', s.mood_score),
    COALESCE(s.created_at, now())
  FROM exo_daily_summaries s
  WHERE s.tenant_id IN (v1_tenant_a, v1_tenant_b)
    AND (s.final_summary IS NOT NULL OR s.draft_summary IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM memory m WHERE m.id = s.id);
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % daily summaries → memory', migrated;

  -- ══════════════════════════════════════════════════════════════
  -- 6. GOALS: user_loops → goals (28 rows, depth=1 areas)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO goals (id, tenant_id, parent_id, depth, title, description, status, progress, priority, strategy, created_at, updated_at)
  SELECT
    l.id,
    v2_tenant,
    NULL,
    1,
    l.name,
    l.description,
    CASE WHEN l.is_active THEN 'active' ELSE 'paused' END,
    0,
    COALESCE(l.priority, 5),
    jsonb_build_object('slug', l.slug, 'icon', l.icon, 'color', l.color),
    l.created_at,
    l.updated_at
  FROM user_loops l
  WHERE l.tenant_id IN (v1_tenant_a, v1_tenant_b)
    AND NOT EXISTS (SELECT 1 FROM goals g WHERE g.id = l.id);
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % loops → goals (depth=1)', migrated;

  -- ══════════════════════════════════════════════════════════════
  -- 7. GOALS: user_quests → goals (10 rows, depth=2)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO goals (id, tenant_id, parent_id, depth, title, description, status, progress, priority, due_at, created_at, updated_at)
  SELECT
    q.id,
    v2_tenant,
    q.loop_id,
    2,
    q.title,
    q.description,
    COALESCE(q.status, 'active'),
    CASE WHEN q.target_ops > 0 THEN (q.completed_ops::real / q.target_ops) ELSE 0 END,
    5,
    q.deadline,
    q.created_at,
    q.updated_at
  FROM user_quests q
  WHERE q.tenant_id IN (v1_tenant_a, v1_tenant_b)
    AND NOT EXISTS (SELECT 1 FROM goals g WHERE g.id = q.id);
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % quests → goals (depth=2)', migrated;

  -- ══════════════════════════════════════════════════════════════
  -- 8. GOALS: user_ops → goals (36 rows, depth=3 tasks)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO goals (id, tenant_id, parent_id, depth, title, description, status, progress, priority, due_at, completed_at, created_at, updated_at)
  SELECT
    o.id,
    v2_tenant,
    o.quest_id,
    3,
    o.title,
    o.description,
    CASE o.status
      WHEN 'completed' THEN 'completed'
      WHEN 'active' THEN 'active'
      WHEN 'pending' THEN 'active'
      WHEN 'dropped' THEN 'dropped'
      WHEN 'blocked' THEN 'paused'
      ELSE COALESCE(o.status, 'active')
    END,
    CASE WHEN o.status = 'completed' THEN 1.0 ELSE 0 END,
    COALESCE(o.priority, 5),
    o.due_date,
    o.completed_at,
    o.created_at,
    o.updated_at
  FROM user_ops o
  WHERE o.tenant_id IN (v1_tenant_a, v1_tenant_b)
    AND NOT EXISTS (SELECT 1 FROM goals g WHERE g.id = o.id);
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % ops → goals (depth=3)', migrated;

  -- ══════════════════════════════════════════════════════════════
  -- 9. GOALS: exo_user_goals → goals (6 rows, depth=0 values)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO goals (id, tenant_id, depth, title, description, status, priority, due_at, strategy, created_at, updated_at)
  SELECT
    g.id,
    v2_tenant,
    0,
    g.name,
    g.description,
    CASE WHEN g.is_active THEN 'active' ELSE 'paused' END,
    5,
    g.target_date,
    jsonb_build_object('category', g.category, 'target_type', g.target_type, 'target_value', g.target_value, 'target_unit', g.target_unit, 'frequency', g.frequency),
    g.created_at,
    g.updated_at
  FROM exo_user_goals g
  WHERE g.tenant_id IN (v1_tenant_a, v1_tenant_b)
    AND NOT EXISTS (SELECT 1 FROM goals gl WHERE gl.id = g.id);
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % user goals → goals (depth=0)', migrated;

  -- ══════════════════════════════════════════════════════════════
  -- 10. CONVERSATIONS + MESSAGES → events (4,821 messages, 79 sessions)
  -- This preserves the conversation history with session grouping.
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO events (id, tenant_id, session_id, seq, kind, data, channel, created_at)
  SELECT
    m.id,
    v2_tenant,
    m.thread_id,
    ROW_NUMBER() OVER (PARTITION BY m.thread_id ORDER BY m.created_at),
    CASE m.role
      WHEN 'user' THEN 'user_msg'
      WHEN 'assistant' THEN 'assistant_msg'
      WHEN 'system' THEN 'system_msg'
      ELSE 'user_msg'
    END,
    jsonb_build_object(
      'content', LEFT(m.content, 50000),
      'role', m.role,
      'v1_source', 'exo_unified_messages'
    ),
    COALESCE(m.channel, 'web_chat'),
    m.created_at
  FROM exo_unified_messages m
  WHERE m.tenant_id IN (v1_tenant_a, v1_tenant_b)
    AND m.content IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.id = m.id);
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % messages → events', migrated;

  -- ══════════════════════════════════════════════════════════════
  -- 11. EMOTION LOG → memory (662 rows, as episodes)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO memory (id, tenant_id, kind, content, importance, source, metadata, created_at)
  SELECT
    el.id,
    v2_tenant,
    'episode',
    'Emotion: ' || COALESCE(el.primary_emotion, 'unknown') ||
      CASE WHEN el.message_text IS NOT NULL THEN ' — ' || LEFT(el.message_text, 200) ELSE '' END,
    COALESCE(el.intensity, 0.5),
    jsonb_build_object('v1_table', 'exo_emotion_log', 'type', 'emotion'),
    jsonb_build_object(
      'primary_emotion', el.primary_emotion,
      'valence', el.valence,
      'arousal', el.arousal,
      'dominance', el.dominance,
      'intensity', el.intensity,
      'session_id', el.session_id
    ),
    el.created_at
  FROM exo_emotion_log el
  WHERE el.tenant_id IN (v1_tenant_a, v1_tenant_b)
    AND NOT EXISTS (SELECT 1 FROM memory m WHERE m.id = el.id);
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Migrated % emotion entries → memory', migrated;

  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE 'v1 → v2 MIGRATION COMPLETE';
  RAISE NOTICE '════════════════════════════════════════';

END $$;
