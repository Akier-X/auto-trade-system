import { query, transaction } from './db';
import { PoolClient } from 'pg';

/**
 * 株式価格データの型定義
 */
export interface StockPrice {
  time: Date;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
}

/**
 * 株式メタデータの型定義
 */
export interface StockMetadata {
  symbol: string;
  name: string;
  market: string;
  sector?: string;
  industry?: string;
}

/**
 * 株式価格データを一括挿入
 * @param prices 株式価格データの配列
 * @returns 挿入された行数
 */
export async function insertStockPrices(prices: StockPrice[]): Promise<number> {
  if (prices.length === 0) return 0;

  const values: any[] = [];
  const placeholders: string[] = [];

  prices.forEach((price, index) => {
    const offset = index * 8;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
    );
    values.push(
      price.time,
      price.symbol,
      price.open,
      price.high,
      price.low,
      price.close,
      price.volume,
      price.adjustedClose || price.close
    );
  });

  const sql = `
    INSERT INTO stock_prices (time, symbol, open, high, low, close, volume, adjusted_close)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (time, symbol) DO UPDATE SET
      open = EXCLUDED.open,
      high = EXCLUDED.high,
      low = EXCLUDED.low,
      close = EXCLUDED.close,
      volume = EXCLUDED.volume,
      adjusted_close = EXCLUDED.adjusted_close
  `;

  try {
    const result = await query(sql, values);
    return result.rowCount || 0;
  } catch (error) {
    console.error('Error inserting stock prices:', error);
    throw error;
  }
}

/**
 * 株式メタデータを保存
 * @param stock 株式メタデータ
 */
export async function upsertStockMetadata(stock: StockMetadata): Promise<void> {
  const sql = `
    INSERT INTO stocks (symbol, name, market, sector, industry)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (symbol) DO UPDATE SET
      name = EXCLUDED.name,
      market = EXCLUDED.market,
      sector = EXCLUDED.sector,
      industry = EXCLUDED.industry,
      updated_at = NOW()
  `;

  await query(sql, [
    stock.symbol,
    stock.name,
    stock.market,
    stock.sector || null,
    stock.industry || null,
  ]);
}

/**
 * 指定期間の株式価格データを取得
 * @param symbol 銘柄コード
 * @param startDate 開始日
 * @param endDate 終了日
 * @returns 株式価格データの配列
 */
export async function getStockPrices(
  symbol: string,
  startDate: Date,
  endDate: Date
): Promise<StockPrice[]> {
  const sql = `
    SELECT time, symbol, open, high, low, close, volume, adjusted_close
    FROM stock_prices
    WHERE symbol = $1 AND time >= $2 AND time <= $3
    ORDER BY time ASC
  `;

  const result = await query<StockPrice>(sql, [symbol, startDate, endDate]);
  return result.rows.map((row) => ({
    ...row,
    adjustedClose: row.adjustedClose,
  }));
}

/**
 * 最新の株式価格を取得
 * @param symbol 銘柄コード
 * @returns 最新の株式価格データ
 */
export async function getLatestStockPrice(
  symbol: string
): Promise<StockPrice | null> {
  const sql = `
    SELECT time, symbol, open, high, low, close, volume, adjusted_close
    FROM stock_prices
    WHERE symbol = $1
    ORDER BY time DESC
    LIMIT 1
  `;

  const result = await query<StockPrice>(sql, [symbol]);
  return result.rows[0] || null;
}

/**
 * 複数銘柄の最新価格を一括取得
 * @param symbols 銘柄コードの配列
 * @returns 銘柄コードと最新価格のマップ
 */
export async function getLatestStockPrices(
  symbols: string[]
): Promise<Map<string, StockPrice>> {
  if (symbols.length === 0) return new Map();

  const sql = `
    SELECT DISTINCT ON (symbol) time, symbol, open, high, low, close, volume, adjusted_close
    FROM stock_prices
    WHERE symbol = ANY($1)
    ORDER BY symbol, time DESC
  `;

  const result = await query<StockPrice>(sql, [symbols]);
  const priceMap = new Map<string, StockPrice>();

  result.rows.forEach((row) => {
    priceMap.set(row.symbol, {
      ...row,
      adjustedClose: row.adjustedClose,
    });
  });

  return priceMap;
}

/**
 * 株式データの統計情報を取得
 * @param symbol 銘柄コード
 * @param days 過去何日分のデータを取得するか
 */
export async function getStockStats(symbol: string, days: number = 30) {
  const sql = `
    SELECT
      symbol,
      COUNT(*) as data_points,
      MIN(low) as min_price,
      MAX(high) as max_price,
      AVG(close) as avg_price,
      SUM(volume) as total_volume,
      MIN(time) as earliest_date,
      MAX(time) as latest_date
    FROM stock_prices
    WHERE symbol = $1 AND time >= NOW() - INTERVAL '${days} days'
    GROUP BY symbol
  `;

  const result = await query(sql, [symbol]);
  return result.rows[0] || null;
}

/**
 * データベースに保存されている全銘柄を取得
 * @returns 銘柄コードと名前の配列
 */
export async function getAllStocks(): Promise<StockMetadata[]> {
  const sql = `
    SELECT symbol, name, market, sector, industry
    FROM stocks
    ORDER BY symbol
  `;

  const result = await query<StockMetadata>(sql);
  return result.rows;
}

/**
 * 日次集計データを取得（TimescaleDB連続集計ビュー使用）
 * @param symbol 銘柄コード
 * @param days 過去何日分
 */
export async function getDailyStats(symbol: string, days: number = 90) {
  const sql = `
    SELECT
      bucket as date,
      symbol,
      open,
      high,
      low,
      close,
      volume
    FROM stock_daily_stats
    WHERE symbol = $1 AND bucket >= NOW() - INTERVAL '${days} days'
    ORDER BY bucket ASC
  `;

  try {
    const result = await query(sql, [symbol]);
    return result.rows;
  } catch (error) {
    // 連続集計ビューが存在しない場合は、通常のクエリで代替
    console.warn('Continuous aggregate not available, using regular query');
    return getStockPrices(
      symbol,
      new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      new Date()
    );
  }
}

export default {
  insertStockPrices,
  upsertStockMetadata,
  getStockPrices,
  getLatestStockPrice,
  getLatestStockPrices,
  getStockStats,
  getAllStocks,
  getDailyStats,
};
