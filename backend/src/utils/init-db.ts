import { query } from './db';

/**
 * データベーステーブルを初期化
 */
export async function initDatabase() {
  console.log('Initializing database tables...');

  try {
    // 株式データテーブル (TimescaleDB Hypertable)
    await query(`
      CREATE TABLE IF NOT EXISTS stock_prices (
        time TIMESTAMPTZ NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        open NUMERIC(12, 2),
        high NUMERIC(12, 2),
        low NUMERIC(12, 2),
        close NUMERIC(12, 2),
        volume BIGINT,
        adjusted_close NUMERIC(12, 2),
        PRIMARY KEY (time, symbol)
      );
    `);

    // Hypertableに変換（TimescaleDB専用）
    await query(`
      SELECT create_hypertable('stock_prices', 'time',
        if_not_exists => TRUE,
        chunk_time_interval => INTERVAL '1 day'
      );
    `).catch((err) => {
      // Hypertableがすでに存在する場合はエラーを無視
      if (!err.message.includes('already a hypertable')) {
        throw err;
      }
    });

    // 株式メタデータテーブル
    await query(`
      CREATE TABLE IF NOT EXISTS stocks (
        symbol VARCHAR(20) PRIMARY KEY,
        name VARCHAR(255),
        market VARCHAR(50),
        sector VARCHAR(100),
        industry VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ニュースデータテーブル
    await query(`
      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        url TEXT UNIQUE,
        source VARCHAR(100),
        published_at TIMESTAMPTZ,
        symbols VARCHAR(20)[],
        sentiment_score NUMERIC(5, 2),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // インデックス作成
    await query(`
      CREATE INDEX IF NOT EXISTS idx_news_published_at ON news (published_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_news_symbols ON news USING GIN (symbols);
    `);

    // 取引履歴テーブル
    await query(`
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        side VARCHAR(10) NOT NULL CHECK (side IN ('buy', 'sell')),
        quantity INTEGER NOT NULL,
        price NUMERIC(12, 2) NOT NULL,
        total_amount NUMERIC(15, 2) NOT NULL,
        order_type VARCHAR(20) DEFAULT 'market',
        status VARCHAR(20) DEFAULT 'pending',
        executed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ポートフォリオテーブル
    await query(`
      CREATE TABLE IF NOT EXISTS portfolio (
        symbol VARCHAR(20) PRIMARY KEY,
        quantity INTEGER NOT NULL DEFAULT 0,
        average_cost NUMERIC(12, 2),
        total_cost NUMERIC(15, 2),
        last_updated TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // AIモデル予測テーブル
    await query(`
      CREATE TABLE IF NOT EXISTS ml_predictions (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        model_name VARCHAR(100),
        prediction_date DATE NOT NULL,
        predicted_price NUMERIC(12, 2),
        confidence_score NUMERIC(5, 2),
        actual_price NUMERIC(12, 2),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(symbol, model_name, prediction_date)
      );
    `);

    // X (Twitter) ポストデータテーブル
    await query(`
      CREATE TABLE IF NOT EXISTS x_posts (
        id BIGSERIAL PRIMARY KEY,
        post_id VARCHAR(50) UNIQUE NOT NULL,
        author_username VARCHAR(100),
        author_name VARCHAR(255),
        text TEXT,
        created_at TIMESTAMPTZ,
        retweet_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0,
        symbols VARCHAR(20)[],
        sentiment_score NUMERIC(5, 2),
        collected_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_x_posts_created_at ON x_posts (created_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_x_posts_symbols ON x_posts USING GIN (symbols);
    `);

    // 連続集計ビュー（TimescaleDB専用）
    await query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS stock_daily_stats
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket('1 day', time) AS bucket,
        symbol,
        FIRST(open, time) as open,
        MAX(high) as high,
        MIN(low) as low,
        LAST(close, time) as close,
        SUM(volume) as volume
      FROM stock_prices
      GROUP BY bucket, symbol
      WITH NO DATA;
    `).catch((err) => {
      // 連続集計ビューが既に存在する場合はエラーを無視
      if (!err.message.includes('already exists')) {
        console.warn('Could not create continuous aggregate:', err.message);
      }
    });

    // リフレッシュポリシーを追加（TimescaleDB専用）
    await query(`
      SELECT add_continuous_aggregate_policy('stock_daily_stats',
        start_offset => INTERVAL '3 days',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour',
        if_not_exists => TRUE
      );
    `).catch((err) => {
      console.warn('Could not add refresh policy:', err.message);
    });

    console.log('✅ Database tables initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
}

/**
 * テーブルを削除（注意: 本番環境では使用しないこと）
 */
export async function dropAllTables() {
  console.warn('⚠️  Dropping all tables...');

  try {
    await query('DROP MATERIALIZED VIEW IF EXISTS stock_daily_stats CASCADE;');
    await query('DROP TABLE IF EXISTS x_posts CASCADE;');
    await query('DROP TABLE IF EXISTS ml_predictions CASCADE;');
    await query('DROP TABLE IF EXISTS portfolio CASCADE;');
    await query('DROP TABLE IF EXISTS trades CASCADE;');
    await query('DROP TABLE IF EXISTS news CASCADE;');
    await query('DROP TABLE IF EXISTS stocks CASCADE;');
    await query('DROP TABLE IF EXISTS stock_prices CASCADE;');

    console.log('✅ All tables dropped successfully');
    return true;
  } catch (error) {
    console.error('❌ Error dropping tables:', error);
    throw error;
  }
}

// スクリプトとして直接実行された場合
if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('Database initialization complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database initialization failed:', error);
      process.exit(1);
    });
}

export default {
  initDatabase,
  dropAllTables,
};
