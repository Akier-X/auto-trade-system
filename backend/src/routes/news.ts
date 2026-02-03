import { Router } from 'express';
import { addSystemLog } from './system';
import { asyncHandler, validateRequired } from '../utils/error-handler';
import { ApiResponse, BadRequestError } from '../utils/api-response';
import { toQueryString, toQueryNumber } from '../utils/query-helpers';

export const newsRouter = Router();

interface NewsArticle {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
  relatedTickers?: string[];
  category?: string;
}

// Yahoo Finance News API
newsRouter.get('/market', asyncHandler(async (req, res) => {
  const { region = 'US', count = 20 } = req.query;

  addSystemLog('マーケットニュースを取得中', 'info');

  // Yahoo Finance News API
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${region}&newsCount=${count}&quotesCount=0`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch market news');
  }

  const data: any = await response.json();
  const articles: NewsArticle[] = (data.news || []).map((item: any) => ({
    title: item.title,
    summary: item.summary || item.description || '',
    url: item.link,
    source: item.publisher,
    publishedAt: new Date(item.providerPublishTime * 1000).toISOString(),
    imageUrl: item.thumbnail?.resolutions?.[0]?.url,
    relatedTickers: item.relatedTickers || [],
  }));

  addSystemLog(`マーケットニュース ${articles.length}件を取得`, 'success');

  res.json(
    ApiResponse.success({
      articles,
      count: articles.length,
    })
  );
}));

// Get news for a specific ticker
newsRouter.get('/ticker/:symbol', asyncHandler(async (req, res) => {
  const { symbol } = req.params;
  const { count = 10 } = req.query;

  addSystemLog(`${symbol} のニュースを取得中`, 'info');

  // Yahoo Finance uses a different endpoint for ticker news
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=${count}&quotesCount=0`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch news for ${symbol}`);
  }

  const data: any = await response.json();
  const articles: NewsArticle[] = (data.news || []).map((item: any) => ({
    title: item.title,
    summary: item.summary || item.description || '',
    url: item.link,
    source: item.publisher,
    publishedAt: new Date(item.providerPublishTime * 1000).toISOString(),
    imageUrl: item.thumbnail?.resolutions?.[0]?.url,
    relatedTickers: item.relatedTickers || [symbol],
  }));

  addSystemLog(`${symbol} のニュース ${articles.length}件を取得`, 'success');

  res.json(
    ApiResponse.success({
      symbol,
      articles,
      count: articles.length,
    })
  );
}));

// Get trending news
newsRouter.get('/trending', asyncHandler(async (req, res) => {
  const { count = 15 } = req.query;

  addSystemLog('トレンドニュースを取得中', 'info');

  // Use multiple market keywords to get diverse trending news
  const keywords = ['stock market', 'nasdaq', 'dow jones', 'sp500', 'finance'];
  const allArticles: NewsArticle[] = [];

  for (const keyword of keywords) {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(keyword)}&newsCount=5&quotesCount=0`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.ok) {
        const data: any = await response.json();
        const articles: NewsArticle[] = (data.news || []).map((item: any) => ({
          title: item.title,
          summary: item.summary || item.description || '',
          url: item.link,
          source: item.publisher,
          publishedAt: new Date(item.providerPublishTime * 1000).toISOString(),
          imageUrl: item.thumbnail?.resolutions?.[0]?.url,
          relatedTickers: item.relatedTickers || [],
        }));
        allArticles.push(...articles);
      }
    } catch (err) {
      console.error(`Failed to fetch news for keyword: ${keyword}`, err);
    }
  }

  // Remove duplicates by URL and sort by publish time
  const uniqueArticles = Array.from(
    new Map(allArticles.map(article => [article.url, article])).values()
  ).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, Number(count));

  addSystemLog(`トレンドニュース ${uniqueArticles.length}件を取得`, 'success');

  res.json(
    ApiResponse.success({
      articles: uniqueArticles,
      count: uniqueArticles.length,
    })
  );
}));

// Get news for multiple tickers (bookmarked stocks)
newsRouter.post('/bookmarks', asyncHandler(async (req, res) => {
  const { tickers } = req.body;

  validateRequired(req.body, ['tickers']);

  if (!Array.isArray(tickers) || tickers.length === 0) {
    throw new BadRequestError('tickers must be a non-empty array');
  }

  addSystemLog(`ブックマーク銘柄のニュースを取得中 (${tickers.length}銘柄)`, 'info');

  const allArticles: NewsArticle[] = [];

  // Fetch news for each ticker
  const newsPromises = tickers.slice(0, 10).map(async (ticker) => {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${ticker}&newsCount=5&quotesCount=0`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.ok) {
        const data: any = await response.json();
        return (data.news || []).map((item: any) => ({
          title: item.title,
          summary: item.summary || item.description || '',
          url: item.link,
          source: item.publisher,
          publishedAt: new Date(item.providerPublishTime * 1000).toISOString(),
          imageUrl: item.thumbnail?.resolutions?.[0]?.url,
          relatedTickers: item.relatedTickers || [ticker],
        }));
      }
      return [];
    } catch (err) {
      console.error(`Failed to fetch news for ${ticker}:`, err);
      return [];
    }
  });

  const results = await Promise.all(newsPromises);
  results.forEach((articles: NewsArticle[]) => allArticles.push(...articles));

  // Remove duplicates and sort
  const uniqueArticles = Array.from(
    new Map(allArticles.map(article => [article.url, article])).values()
  ).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  addSystemLog(`ブックマーク銘柄のニュース ${uniqueArticles.length}件を取得`, 'success');

  res.json(
    ApiResponse.success({
      articles: uniqueArticles,
      count: uniqueArticles.length,
    })
  );
}));

// AI summarize news article
newsRouter.post('/summarize', asyncHandler(async (req, res) => {
  const { apiKey, text, provider = 'gemini' } = req.body;

  validateRequired(req.body, ['apiKey', 'text']);

  addSystemLog('ニュース記事をAI要約中', 'info');

  if (provider === 'gemini') {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `以下のニュース記事を3-5文で簡潔に要約してください。投資家にとって重要なポイントを強調してください。

記事:
${text}

要約:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summary = response.text();

    addSystemLog('ニュース要約完了', 'success');

    res.json(
      ApiResponse.success({ summary })
    );
  } else {
    throw new BadRequestError('Unsupported provider', 'Only gemini is currently supported');
  }
}));
