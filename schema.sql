CREATE TABLE IF NOT EXISTS qr_links (
  id          TEXT PRIMARY KEY,
  destino     TEXT NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qr_scans (
  id         BIGSERIAL PRIMARY KEY,
  qr_id      TEXT NOT NULL,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash    TEXT,
  pais       TEXT,
  ciudad     TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_scans_qr_ts ON qr_scans (qr_id, ts);