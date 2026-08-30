#!/usr/bin/env node
/**
 * Fails when the live database is missing a column that schema.prisma expects.
 *
 * The datasource has no `url` — Prisma reaches libsql through a runtime driver
 * adapter — so `prisma db push` and `prisma migrate deploy` cannot talk to the
 * production database from CI, and schema changes are applied by hand. Nothing
 * used to notice when that step was forgotten: the deploy went green and every
 * query touching the new column returned a 500 in production instead
 * ("no such column: main.rooms.slug", 2026-08-30).
 *
 * Run against the live DB before flipping traffic. Read-only; it never writes.
 *
 *   node scripts/check-schema-drift.js [--url http://127.0.0.1:8080] [--schema path]
 *
 * Exit 0 = in sync, 1 = drift (prints the ALTER TABLE statements to run), 2 = could not check.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const DB_URL = argOf('--url', process.env.LIBSQL_HTTP_URL || 'http://127.0.0.1:8080');
const SCHEMA = argOf('--schema', path.join(__dirname, '..', 'prisma', 'schema.prisma'));

/** Prisma scalar type -> SQLite column type, for the suggested ALTER TABLE. */
const SQLITE_TYPE = {
  String: 'TEXT',
  Int: 'INTEGER',
  BigInt: 'INTEGER',
  Float: 'REAL',
  Decimal: 'DECIMAL',
  Boolean: 'BOOLEAN',
  DateTime: 'DATETIME',
  Json: 'JSONB',
  Bytes: 'BLOB',
};

async function query(sql) {
  const res = await fetch(`${DB_URL.replace(/\/$/, '')}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ type: 'execute', stmt: { sql } }, { type: 'close' }],
    }),
  });
  if (!res.ok) throw new Error(`libsql HTTP ${res.status}`);
  const body = await res.json();
  const result = body.results[0];
  if (result.type !== 'ok') {
    throw new Error(result.error && result.error.message ? result.error.message : 'query failed');
  }
  return result.response.result.rows.map((row) => row.map((c) => c.value));
}

/** Models in schema.prisma, as { model, table, columns: [{ name, type, optional }] }. */
function parseSchema(src) {
  const stripped = src.replace(/\/\/.*$/gm, '');
  const modelNames = new Set([...stripped.matchAll(/model\s+(\w+)\s*\{/g)].map((m) => m[1]));
  const models = [];

  for (const match of stripped.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, model, body] = match;
    if (/@@ignore\b/.test(body)) continue;

    const mapped = body.match(/@@map\("([^"]+)"\)/);
    const columns = [];

    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('@@') || line.startsWith('//')) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      const [field, rawType] = parts;
      if (!/^\w+$/.test(field)) continue;
      // Relation fields and list fields are not columns. Their scalar
      // counterparts (ownerId, propertyId, ...) are, and fall through.
      if (rawType.endsWith('[]')) continue;
      const base = rawType.replace(/[?\[\]]/g, '');
      if (modelNames.has(base)) continue;
      if (/@ignore\b/.test(line)) continue;

      const colMap = line.match(/@map\("([^"]+)"\)/);
      columns.push({
        name: colMap ? colMap[1] : field,
        // Anything not a known scalar is an enum, stored as TEXT.
        type: SQLITE_TYPE[base] || 'TEXT',
        optional: rawType.includes('?'),
      });
    }

    models.push({ model, table: mapped ? mapped[1] : model, columns });
  }
  return models;
}

(async () => {
  let live;
  try {
    const tables = await query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    live = new Map();
    for (const [table] of tables) {
      const info = await query(`PRAGMA table_info("${table}")`);
      live.set(
        table,
        new Set(info.map((r) => r[1])),
      );
    }
  } catch (err) {
    console.error(`[schema-drift] could not reach the database at ${DB_URL}: ${err.message}`);
    process.exit(2);
  }

  const models = parseSchema(fs.readFileSync(SCHEMA, 'utf8'));
  const problems = [];
  const fixes = [];

  for (const { model, table, columns } of models) {
    if (!live.has(table)) {
      problems.push(`  table "${table}" (model ${model}) does not exist`);
      continue;
    }
    const present = live.get(table);
    for (const col of columns) {
      if (present.has(col.name)) continue;
      problems.push(`  ${table}.${col.name} (model ${model}) is missing`);
      // A NOT NULL column needs a value for the existing rows, so it cannot be
      // added blind — flag it rather than suggesting a statement that will fail.
      fixes.push(
        col.optional
          ? `ALTER TABLE "${table}" ADD COLUMN "${col.name}" ${col.type};`
          : `-- ${table}.${col.name} is NOT NULL: add it with a DEFAULT or backfill, e.g.\n-- ALTER TABLE "${table}" ADD COLUMN "${col.name}" ${col.type} NOT NULL DEFAULT '<value>';`,
      );
    }
  }

  if (problems.length === 0) {
    console.log(`[schema-drift] OK - ${models.length} models match the database`);
    process.exit(0);
  }

  console.error('[schema-drift] the live database is behind prisma/schema.prisma:\n');
  console.error(problems.join('\n'));
  console.error('\nQueries selecting these columns will fail with a 500 in production.');
  console.error('Apply on the VPS, then re-run the deploy:\n');
  console.error(fixes.join('\n'));
  console.error('\n(unique fields also need: CREATE UNIQUE INDEX "<table>_<col>_key" ON "<table>"("<col>");)');
  process.exit(1);
})();
