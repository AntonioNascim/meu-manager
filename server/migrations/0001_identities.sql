-- Identidades anônimas (Fase 6, B2). Só o necessário: chave pública, datas e apelido. Sem e-mail, sem IP.
CREATE TABLE IF NOT EXISTS identities (
  player_id  TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  nickname   TEXT
) WITHOUT ROWID;

-- Para apagar contas sem uso há 12 meses (proposta 7.1).
CREATE INDEX IF NOT EXISTS identities_last_seen ON identities (last_seen);
