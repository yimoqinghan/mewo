import pg from 'pg';
import { config } from '../config.js';

const { Pool, types } = pg;

// bigint（count/字节数）默认返回字符串，业务里当数字用，统一转成 number。
// 注意：涉及超过 2^53 的金额列时不要走这条路径，本项目只用于字节数和计数。
types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

export const pool = new Pool({
  connectionString: config.db.connectionString,
  max: config.db.max,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // 2C2G 机器上单个查询不应长时间占用连接
  statement_timeout: 15000
});

pool.on('error', (error) => {
  console.error('[db] 空闲连接异常', error);
});

export function query(text, params) {
  return pool.query(text, params);
}

/**
 * 事务包装。回调内抛错会自动回滚。
 * 注意：所有业务必须使用同一 client，不能直接用全局 query。
 */
export async function withTransaction(handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // 回滚失败通常意味着连接已断，交给连接池处理
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
