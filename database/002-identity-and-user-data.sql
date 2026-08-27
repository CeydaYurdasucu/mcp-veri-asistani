-- VeriAsistan uygulama kimliği ve kullanıcıya özel veri alanı.
-- İşletme tabloları public şemasında ve chatbot_reader ile salt okunur kalır.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_writer') THEN
    CREATE ROLE app_writer LOGIN PASSWORD 'appwriterpass';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS app_identity;

CREATE TABLE IF NOT EXISTS app_identity.users (
  id UUID PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  title VARCHAR(80) NOT NULL DEFAULT '',
  role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'analyst', 'admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_count SMALLINT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_identity.sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_identity.users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS app_identity.conversations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_identity.users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL DEFAULT 'Yeni sohbet',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_identity.messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES app_identity.conversations(id) ON DELETE CASCADE,
  role VARCHAR(12) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sql TEXT,
  result_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  source VARCHAR(20) CHECK (source IS NULL OR source IN ('verified', 'gemini', 'offline')),
  verified_metric VARCHAR(100),
  context_messages SMALLINT NOT NULL DEFAULT 0,
  sql_corrected BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_identity.favorites (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_identity.users(id) ON DELETE CASCADE,
  question VARCHAR(500) NOT NULL,
  question_key VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, question_key)
);

CREATE INDEX IF NOT EXISTS idx_sessions_active ON app_identity.sessions(token_hash, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON app_identity.conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON app_identity.messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_favorites_user_created ON app_identity.favorites(user_id, created_at DESC);

REVOKE ALL ON SCHEMA app_identity FROM PUBLIC;
GRANT USAGE ON SCHEMA app_identity TO app_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app_identity TO app_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_identity GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_writer;

-- app_writer yalnızca uygulama şemasında yazabilir; public iş tablolarına yazma izni verilmez.
