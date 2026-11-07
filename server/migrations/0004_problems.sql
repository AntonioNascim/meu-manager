-- Relatos de problema do teste fechado (B9). Anônimos: sem conta, sem IP. A imagem (JPEG pequeno, opcional) fica no R2 privado em problems/<id>.jpg.
CREATE TABLE IF NOT EXISTS problem_reports (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  category   TEXT NOT NULL,
  text       TEXT NOT NULL,
  tech       TEXT NOT NULL,
  has_image  INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'open'
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS problem_reports_status ON problem_reports (status, created_at);
