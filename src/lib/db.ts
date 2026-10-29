// Rooms created before the read/write key split used a `room_config` table. They are
// discarded rather than migrated: without a `room` row no secret resolves to a role.
export function initSchema(sql: SqlStorage): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS room (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      read_hash TEXT NOT NULL,
      write_hash TEXT NOT NULL,
      history_bytes INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS pads (
      name TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pad_name TEXT NOT NULL,
      version INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('full', 'delta')),
      content TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('api', 'mcp', 'web')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS revisions_by_pad ON revisions (pad_name, version);
  `);
}
