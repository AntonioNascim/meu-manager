-- Ligas online (Fase 6, B8.3). O Durable Object da liga é dono das vagas e do mundo; estas tabelas são o índice para listar e conferir limites.
CREATE TABLE IF NOT EXISTS leagues (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  code         TEXT,
  admin_id     TEXT NOT NULL,
  pace         TEXT NOT NULL,
  band         TEXT NOT NULL,
  tz_offset    INTEGER NOT NULL,
  world        TEXT NOT NULL,
  seed         INTEGER NOT NULL,
  max_humans   INTEGER NOT NULL,
  status       TEXT NOT NULL,
  entry_closed INTEGER NOT NULL DEFAULT 0,
  hidden       INTEGER NOT NULL DEFAULT 0,
  direct       INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
) WITHOUT ROWID;
CREATE UNIQUE INDEX IF NOT EXISTS leagues_code ON leagues (code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS leagues_directory ON leagues (kind, status, hidden, entry_closed, created_at);
CREATE INDEX IF NOT EXISTS leagues_admin ON leagues (admin_id);

CREATE TABLE IF NOT EXISTS league_members (
  league_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  team_id   TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (league_id, player_id)
) WITHOUT ROWID;
-- Um técnico por clube em cada liga: a corrida entre dois pedidos para o mesmo clube termina aqui.
CREATE UNIQUE INDEX IF NOT EXISTS league_members_team ON league_members (league_id, team_id);
CREATE INDEX IF NOT EXISTS league_members_player ON league_members (player_id);
