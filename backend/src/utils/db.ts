import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// TimescaleDB (PostgreSQL) 接続プール
const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: {
    rejectUnauthorized: false, // TimescaleDB Cloudの自己署名証明書を許可
  },
  max: 20, // 最大接続数
  idleTimeoutMillis: 30000, // アイドルタイムアウト
  connectionTimeoutMillis: 5000, // 接続タイムアウト
});

// 接続エラーハンドリング
pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
});

/**
 * データベースクエリを実行
 * @param text SQLクエリ
 * @param params クエリパラメータ
 * @returns クエリ結果
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    console.log('executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * トランザクションを実行
 * @param callback トランザクション内で実行する処理
 * @returns コールバックの実行結果
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * データベース接続をテスト
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW() as current_time');
    console.log('Database connection successful:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

/**
 * データベース接続プールを取得
 */
export function getPool(): Pool {
  return pool;
}

/**
 * データベース接続プールをクローズ
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}

export default {
  query,
  transaction,
  testConnection,
  getPool,
  closePool,
};
