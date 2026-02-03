import { Router } from 'express';
import { asyncHandler, validateRequired, validateArray } from '../utils/error-handler';
import { ApiResponse, BadRequestError, NotFoundError } from '../utils/api-response';
import { toQueryString, toQueryNumber } from '../utils/query-helpers';
import {
  insertStockPrices,
  upsertStockMetadata,
  getStockPrices,
  getLatestStockPrice,
  getLatestStockPrices,
  getStockStats,
  getAllStocks,
  getDailyStats,
} from '../utils/stock-data';

export const stockRouter = Router();

// 銘柄名で検索（Yahoo Finance Search API使用）
stockRouter.get('/search/:query', asyncHandler(async (req, res) => {
  const query = String(req.params.query);

  if (!query || query.length < 2) {
    throw new BadRequestError('Query too short', 'Please provide at least 2 characters');
  }

  // Yahoo Finance Search APIを使用
  const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`;

  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  const data: any = await response.json();

  if (!response.ok) {
    throw new Error('Failed to search Yahoo Finance');
  }

  // 検索結果を整形
  const results = (data.quotes || []).map((quote: any) => ({
    symbol: quote.symbol,
    name: quote.shortname || quote.longname || quote.symbol,
    exchange: quote.exchange,
    type: quote.quoteType,
    score: quote.score,
  })).filter((result: any) =>
    // 株式のみフィルタ（ETF、暗号通貨などを除外）
    result.type === 'EQUITY' || result.type === 'ETF'
  );

  res.json(
    ApiResponse.success({
      query,
      results,
      count: results.length,
    })
  );
}));

// Yahoo Finance APIの代替として、簡易的な株価データ取得
stockRouter.get('/quote/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol);

  // 日本語名を取得（日本株の場合）
  let japaneseName = '';
  if (symbol.endsWith('.T')) {
    try {
      const jpUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?region=JP&lang=ja-JP`;
      const jpResponse = await fetch(jpUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'ja-JP,ja;q=0.9'
        }
      });
      const jpData: any = await jpResponse.json();

      if (jpResponse.ok && !jpData.chart.error) {
        const jpMeta = jpData.chart.result[0].meta;
        japaneseName = jpMeta.longName || jpMeta.shortName || '';
      }
    } catch (err) {
      console.log('Failed to fetch Japanese name, using English fallback');
    }
  }

  // 株価データを取得（User-Agentヘッダーを追加してレート制限を回避）
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
  const response = await fetch(yahooUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Yahoo Finance APIのレート制限に達しました。しばらく待ってから再試行してください。');
    }
    throw new Error(`Yahoo Finance API error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();

  if (!response.ok || data.chart.error) {
    throw new NotFoundError(
      'Stock not found',
      data.chart.error?.description || 'Invalid symbol'
    );
  }

  const result = data.chart.result[0];
  const meta = result.meta;
  const quote = result.indicators.quote[0];
  const timestamp = result.timestamp;

  // データ検証
  if (!quote || !quote.close || quote.close.length === 0) {
    throw new Error('株価データが取得できませんでした');
  }

  // 最新の株価データを取得
  const latestIndex = quote.close.length - 1;
  const currentPrice = quote.close[latestIndex];
  const previousClose = meta.chartPreviousClose || meta.previousClose || currentPrice;
  const change = currentPrice - previousClose;
  const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

  res.json(
    ApiResponse.success({
      symbol: meta.symbol,
      name: japaneseName || meta.longName || meta.shortName || symbol,
      currency: meta.currency,
      exchange: meta.exchangeName,
      price: currentPrice,
      previousClose: previousClose,
      change: change,
      changePercent: changePercent,
      volume: quote.volume[latestIndex],
      marketCap: meta.marketCap,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      timestamp: new Date(timestamp[latestIndex] * 1000).toISOString(),
    })
  );
}));

// 複数銘柄の株価を一度に取得
stockRouter.post('/quotes', asyncHandler(async (req, res) => {
  const { symbols } = req.body;

  validateArray(req.body, 'symbols', 1);

  const quotes = await Promise.all(
    symbols.map(async (symbol: string) => {
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
        const response = await fetch(yahooUrl);
        const data: any = await response.json();

        if (!response.ok || data.chart.error) {
          return { symbol, error: 'Not found' };
        }

        const result = data.chart.result[0];
        const meta = result.meta;
        const quote = result.indicators.quote[0];

        const latestIndex = quote.close.length - 1;
        const currentPrice = quote.close[latestIndex];
        const previousClose = meta.chartPreviousClose || meta.previousClose;

        return {
          symbol: meta.symbol,
          price: currentPrice,
          change: currentPrice - previousClose,
          changePercent: ((currentPrice - previousClose) / previousClose) * 100,
        };
      } catch (error) {
        return { symbol, error: 'Failed to fetch' };
      }
    })
  );

  res.json(
    ApiResponse.success({
      quotes,
      timestamp: new Date().toISOString(),
    })
  );
}));

// 株価の履歴データを取得
stockRouter.get('/history/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol);
  const range = toQueryString(req.query.range as any, '1mo');
  const interval = toQueryString(req.query.interval as any, '1d');

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;

  const response = await fetch(yahooUrl);
  const data: any = await response.json();

  if (!response.ok || data.chart.error) {
    throw new NotFoundError(
      'Stock not found',
      data.chart.error?.description || 'Invalid symbol'
    );
  }

  const result = data.chart.result[0];
  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];

  const history = timestamps.map((timestamp: number, index: number) => ({
    date: new Date(timestamp * 1000).toISOString(),
    open: quote.open[index],
    high: quote.high[index],
    low: quote.low[index],
    close: quote.close[index],
    volume: quote.volume[index],
  }));

  res.json(
    ApiResponse.success({
      symbol: result.meta.symbol,
      history,
    })
  );
}));

// === データベース統合エンドポイント ===

// 株価データをデータベースに保存
stockRouter.post('/db/save', asyncHandler(async (req, res) => {
  const { prices } = req.body;

  validateArray(req.body, 'prices', 1);

  const count = await insertStockPrices(prices);

  res.json(
    ApiResponse.success({ count }, 'Stock prices saved')
  );
}));

// 株式メタデータを保存
stockRouter.post('/db/metadata', asyncHandler(async (req, res) => {
  const { symbol, name, market, sector, industry } = req.body;

  validateRequired(req.body, ['symbol', 'name', 'market']);

  await upsertStockMetadata({ symbol, name, market, sector, industry });

  res.json(
    ApiResponse.success({ symbol }, 'Stock metadata saved')
  );
}));

// データベースから株価履歴を取得
stockRouter.get('/db/history/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol);
  const startDateQuery = toQueryString(req.query.startDate as any);
  const endDateQuery = toQueryString(req.query.endDate as any);
  const days = toQueryNumber(req.query.days as any, 30);

  let start: Date, end: Date;

  if (startDateQuery && endDateQuery) {
    start = new Date(startDateQuery);
    end = new Date(endDateQuery);
  } else {
    end = new Date();
    start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  const prices = await getStockPrices(symbol, start, end);

  res.json(
    ApiResponse.success({
      symbol,
      count: prices.length,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      prices,
    })
  );
}));

// 最新の株価を取得
stockRouter.get('/db/latest/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol);
  const price = await getLatestStockPrice(symbol);

  if (!price) {
    throw new NotFoundError('No data found for symbol', symbol);
  }

  res.json(
    ApiResponse.success({
      symbol,
      price,
    })
  );
}));

// 複数銘柄の最新株価を一括取得
stockRouter.post('/db/latest', asyncHandler(async (req, res) => {
  const { symbols } = req.body;

  validateArray(req.body, 'symbols', 1);

  const pricesMap = await getLatestStockPrices(symbols);
  const prices = Array.from(pricesMap.values());

  res.json(
    ApiResponse.success({
      count: prices.length,
      prices,
    })
  );
}));

// 株式統計情報を取得
stockRouter.get('/db/stats/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol);
  const days = toQueryNumber(req.query.days as any, 30);

  const stats = await getStockStats(symbol, days);

  if (!stats) {
    throw new NotFoundError('No data found for symbol', symbol);
  }

  res.json(
    ApiResponse.success({
      symbol,
      stats,
    })
  );
}));

// データベースに保存されている全銘柄を取得
stockRouter.get('/db/list', asyncHandler(async (req, res) => {
  const stocks = await getAllStocks();

  res.json(
    ApiResponse.success({
      count: stocks.length,
      stocks,
    })
  );
}));

// 日次集計データを取得（TimescaleDB連続集計ビュー）
stockRouter.get('/db/daily/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol);
  const days = toQueryNumber(req.query.days as any, 90);

  const dailyStats = await getDailyStats(symbol, days);

  res.json(
    ApiResponse.success({
      symbol,
      count: dailyStats.length,
      dailyStats,
    })
  );
}));
