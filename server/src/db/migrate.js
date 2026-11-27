import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, 'migrations');

async function ensureMigrationTable(client) {
  await client.query(`
    create table if not exists schema_migration (
      name        text primary key,
      applied_at  timestamptz not null default now()
    )
  `);
}

async function main() {
  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);

    const applied = new Set(
      (await client.query('select name from schema_migration')).rows.map((row) => row.name)
    );

    const files = (await readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      console.log(`[migrate] 执行 ${file}`);
      // 每个迁移单独一个事务，失败即中断，避免半套表结构
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('insert into schema_migration (name) values ($1)', [file]);
        await client.query('COMMIT');
        count += 1;
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`迁移 ${file} 失败：${error.message}`);
      }
    }

    console.log(count === 0 ? '[migrate] 无待执行迁移' : `[migrate] 完成，共执行 ${count} 个`);
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
