-- Moderação (Fase 6, B9). Denúncias de apelidos e de ligas e identidades banidas. Só ids e datas: nada de IP, nada de texto livre da pessoa que denuncia.
CREATE TABLE IF NOT EXISTS reports (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  target     TEXT NOT NULL,
  reporter   TEXT NOT NULL,
  reason     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open'
) WITHOUT ROWID;
-- Uma denúncia aberta por pessoa e alvo.
CREATE UNIQUE INDEX IF NOT EXISTS reports_once ON reports (kind, target, reporter) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS reports_status ON reports (status, created_at);

CREATE TABLE IF NOT EXISTS bans (
  player_id TEXT PRIMARY KEY,
  reason    TEXT NOT NULL,
  banned_at INTEGER NOT NULL
) WITHOUT ROWID;
