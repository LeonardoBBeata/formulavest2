CREATE TABLE IF NOT EXISTS study_progress (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_generation_jobs (
  id UUID PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('enem', 'provao')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 90),
  prova_id INTEGER REFERENCES provas_ativas(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_generation_jobs_status_created
  ON exam_generation_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_exam_generation_jobs_user_created
  ON exam_generation_jobs(usuario_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_generation_jobs_one_active_per_user
  ON exam_generation_jobs(usuario_id)
  WHERE status IN ('queued', 'running');
