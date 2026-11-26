/**
 * Runs a real PostgreSQL 16 server from npm, for machines without Docker.
 *
 *   pnpm db:embedded        (leave it running; Ctrl+C to stop)
 *
 * Data lives in <repo>/.pgdata. On first start it creates the same `fitflow` role and
 * database as infra/postgres/init.sql, so DATABASE_URL in .env.example works unchanged.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dataDir = resolve(repoRoot, '.pgdata');
const port = Number(process.env.PGPORT ?? 5432);
const firstRun = !existsSync(dataDir);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  onLog: () => {},
});

if (firstRun) await pg.initialise();
await pg.start();

if (firstRun) {
  const client = pg.getPgClient();
  await client.connect();
  const sql = readFileSync(resolve(repoRoot, 'infra/postgres/init.sql'), 'utf8');
  // CREATE DATABASE cannot run inside a multi-statement string, so run statements one by one.
  for (const statement of sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await client.query(statement);
  }
  await client.end();
  console.log('Created role "fitflow" and database "fitflow".');
}

console.log(`PostgreSQL 16 running on localhost:${port} (data: ${dataDir}). Ctrl+C to stop.`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
