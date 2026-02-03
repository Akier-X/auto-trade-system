import { Router } from 'express';
import { asyncHandler, validateRequired, validateArray } from '../utils/error-handler';
import { ApiResponse, BadRequestError } from '../utils/api-response';
import { addSystemLog } from './system';

export const feedsRouter = Router();

interface FeedArticle {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
  author?: string;
  category?: string;
  tags?: string[];
}

// RSS/Atom フィードパーサー
async function parseRSSFeed(feedUrl: string): Promise<FeedArticle[]> {
  try {
    const Parser = require('rss-parser');
    const parser = new Parser({
      customFields: {
        item: ['media:content', 'media:thumbnail', 'dc:creator', 'category']
      }
    });

    const feed = await parser.parseURL(feedUrl);

    return feed.items.map((item: any) => ({
      title: item.title || '',
      summary: item.contentSnippet || item.content || item.description || '',
      url: item.link || '',
      source: feed.title || 'RSS Feed',
      publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
      imageUrl: item['media:content']?.$?.url || item['media:thumbnail']?.$?.url || item.enclosure?.url,
      author: item['dc:creator'] || item.creator || item.author,
      category: Array.isArray(item.category) ? item.category[0] : item.category,
    }));
  } catch (error) {
    console.error('RSS parse error:', error);
    return [];
  }
}

// 金融ニュースRSSフィードのリスト
const FINANCE_RSS_FEEDS = [
  {
    name: 'Reuters Business',
    url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best',
    category: 'business',
  },
  {
    name: 'Bloomberg Markets',
    url: 'https://feeds.bloomberg.com/markets/news.rss',
    category: 'markets',
  },
  {
    name: 'CNBC Top News',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    category: 'news',
  },
  {
    name: 'MarketWatch',
    url: 'https://www.marketwatch.com/rss/topstories',
    category: 'markets',
  },
  {
    name: 'Seeking Alpha',
    url: 'https://seekingalpha.com/feed.xml',
    category: 'analysis',
  },
  {
    name: 'Financial Times',
    url: 'https://www.ft.com/?format=rss',
    category: 'news',
  },
  {
    name: 'WSJ Markets',
    url: 'https://feeds.wsj.com/wsj/xml/rss/3_7031.xml',
    category: 'markets',
  },
  {
    name: 'Yahoo Finance',
    url: 'https://finance.yahoo.com/news/rssindex',
    category: 'finance',
  },
];

// 日本の金融ニュースフィード
const JAPAN_FINANCE_FEEDS = [
  // 主要メディア - 経済ニュース
  {
    name: '日本経済新聞',
    url: 'https://www.nikkei.com/news/feed',
    category: 'major-media',
  },
  {
    name: 'NHK ビジネス',
    url: 'https://www3.nhk.or.jp/rss/news/cat6.xml',
    category: 'major-media',
  },
  {
    name: '朝日新聞 経済',
    url: 'https://www.asahi.com/rss/asahi/business.rdf',
    category: 'major-media',
  },

  // 金融・経済専門メディア
  {
    name: 'ロイター日本語',
    url: 'https://jp.reuters.com/rssFeed/businessNews',
    category: 'finance',
  },
  {
    name: 'Bloomberg日本語',
    url: 'https://www.bloomberg.co.jp/feed/news.rss',
    category: 'finance',
  },
  {
    name: '東洋経済オンライン',
    url: 'https://toyokeizai.net/list/feed/rss',
    category: 'finance',
  },
  {
    name: 'ダイヤモンド・オンライン',
    url: 'https://diamond.jp/list/feed/rss',
    category: 'finance',
  },
  {
    name: 'ZUU online',
    url: 'https://zuuonline.com/feed',
    category: 'finance',
  },

  // 株式・投資情報
  {
    name: 'Yahoo!ファイナンス',
    url: 'https://news.yahoo.co.jp/rss/topics/business.xml',
    category: 'stock',
  },
  {
    name: '株探ニュース',
    url: 'https://kabutan.jp/news/feed/',
    category: 'stock',
  },
  {
    name: 'みんなの株式',
    url: 'https://minkabu.jp/rss/all',
    category: 'stock',
  },
  {
    name: 'トレーダーズ・ウェブ',
    url: 'https://www.traders.co.jp/rss/news.rdf',
    category: 'stock',
  },

  // テクノロジー・スタートアップ
  {
    name: 'TechCrunch Japan',
    url: 'https://jp.techcrunch.com/feed/',
    category: 'tech',
  },
  {
    name: 'THE BRIDGE',
    url: 'https://thebridge.jp/feed',
    category: 'tech',
  },
  {
    name: 'ITmedia ビジネス',
    url: 'https://rss.itmedia.co.jp/rss/2.0/business.xml',
    category: 'tech',
  },
  {
    name: 'CNET Japan',
    url: 'https://japan.cnet.com/rss/index.rdf',
    category: 'tech',
  },

  // 企業・プレスリリース
  {
    name: 'PR TIMES',
    url: 'https://prtimes.jp/main/rss/',
    category: 'press',
  },
  {
    name: 'ベンチャータイムズ',
    url: 'https://venturetimes.jp/feed',
    category: 'press',
  },

  // マーケット情報
  {
    name: 'Market Hack',
    url: 'http://markethack.net/index.rdf',
    category: 'market',
  },
  {
    name: 'MoneyZine',
    url: 'https://moneyzine.jp/rss/news',
    category: 'market',
  },
];

// 複数のRSSフィードから記事を取得
feedsRouter.get('/rss/all', asyncHandler(async (req, res) => {
  const { category, count = 50 } = req.query;

  addSystemLog('RSSフィードから記事を取得中', 'info');

  let feeds = [...FINANCE_RSS_FEEDS];

  // カテゴリフィルタ
  if (category && category !== 'all') {
    feeds = feeds.filter(feed => feed.category === category);
  }

  // 並行処理で全フィードを取得
  const articlesPromises = feeds.map(async (feed) => {
    try {
      const articles = await parseRSSFeed(feed.url);
      return articles.map(article => ({
        ...article,
        source: feed.name,
        category: feed.category,
      }));
    } catch (error) {
      console.error(`Failed to fetch ${feed.name}:`, error);
      return [];
    }
  });

  const results = await Promise.all(articlesPromises);
  const allArticles = results.flat();

  // 重複を除去して新しい順にソート
  const uniqueArticles = Array.from(
    new Map(allArticles.map(article => [article.url, article])).values()
  )
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, Number(count));

  addSystemLog(`RSS記事 ${uniqueArticles.length}件を取得`, 'success');

  res.json(
    ApiResponse.success({
      articles: uniqueArticles,
      count: uniqueArticles.length,
      sources: feeds.length,
    })
  );
}));

// 日本語ニュースフィード
feedsRouter.get('/rss/japan', asyncHandler(async (req, res) => {
  const { count = 30 } = req.query;

  addSystemLog('日本語ニュースを取得中', 'info');

  const articlesPromises = JAPAN_FINANCE_FEEDS.map(async (feed) => {
    try {
      const articles = await parseRSSFeed(feed.url);
      return articles.map(article => ({
        ...article,
        source: feed.name,
        category: feed.category,
      }));
    } catch (error) {
      console.error(`Failed to fetch ${feed.name}:`, error);
      return [];
    }
  });

  const results = await Promise.all(articlesPromises);
  const allArticles = results.flat();

  const uniqueArticles = Array.from(
    new Map(allArticles.map(article => [article.url, article])).values()
  )
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, Number(count));

  addSystemLog(`日本語ニュース ${uniqueArticles.length}件を取得`, 'success');

  res.json(
    ApiResponse.success({
      articles: uniqueArticles,
      count: uniqueArticles.length,
    })
  );
}));

// カスタムRSSフィードを追加
feedsRouter.post('/rss/custom', asyncHandler(async (req, res) => {
  const { url } = req.body;

  validateRequired(req.body, ['url']);

  addSystemLog(`カスタムフィードを取得中: ${url}`, 'info');

  const articles = await parseRSSFeed(url);

  addSystemLog(`カスタムフィード ${articles.length}件を取得`, 'success');

  res.json(
    ApiResponse.success({
      articles,
      count: articles.length,
    })
  );
}));

// News API統合 (オプション - APIキーが必要)
feedsRouter.get('/newsapi', asyncHandler(async (req, res) => {
  const { apiKey, query = 'stocks OR trading OR market', count = 20 } = req.query;

  validateRequired(req.query, ['apiKey']);

  addSystemLog('News APIから記事を取得中', 'info');

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query as string)}&sortBy=publishedAt&pageSize=${count}&apiKey=${apiKey}`;

  const response = await fetch(url);
  const data: any = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'News API error');
  }

  const articles: FeedArticle[] = (data.articles || []).map((article: any) => ({
    title: article.title,
    summary: article.description || article.content || '',
    url: article.url,
    source: article.source.name,
    publishedAt: article.publishedAt,
    imageUrl: article.urlToImage,
    author: article.author,
  }));

  addSystemLog(`News API記事 ${articles.length}件を取得`, 'success');

  res.json(
    ApiResponse.success({
      articles,
      count: articles.length,
    })
  );
}));

// キーワード監視機能
feedsRouter.post('/monitor/keywords', asyncHandler(async (req, res) => {
  const { keywords, sources = 'all' } = req.body;

  validateArray(req.body, 'keywords', 1);

  addSystemLog(`キーワード監視開始: ${keywords.join(', ')}`, 'info');

  // RSSフィードから記事を取得
  let feeds = [...FINANCE_RSS_FEEDS];
  if (sources === 'japan') {
    feeds = [...JAPAN_FINANCE_FEEDS];
  } else if (sources === 'both') {
    feeds = [...FINANCE_RSS_FEEDS, ...JAPAN_FINANCE_FEEDS];
  }

  const articlesPromises = feeds.map(async (feed) => {
    try {
      const articles = await parseRSSFeed(feed.url);
      return articles.map(article => ({
        ...article,
        source: feed.name,
      }));
    } catch (error) {
      return [];
    }
  });

  const results = await Promise.all(articlesPromises);
  const allArticles = results.flat();

  // キーワードでフィルタリング
  const keywordRegex = new RegExp(keywords.join('|'), 'i');
  const matchedArticles = allArticles.filter(article =>
    keywordRegex.test(article.title) ||
    keywordRegex.test(article.summary)
  );

  const uniqueArticles = Array.from(
    new Map(matchedArticles.map(article => [article.url, article])).values()
  ).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  addSystemLog(`キーワードマッチ ${uniqueArticles.length}件を検出`, uniqueArticles.length > 0 ? 'success' : 'info');

  res.json(
    ApiResponse.success({
      articles: uniqueArticles,
      count: uniqueArticles.length,
      keywords,
    })
  );
}));

// 利用可能なフィードソース一覧
feedsRouter.get('/sources', (req, res) => {
  res.json(
    ApiResponse.success({
      sources: {
        global: FINANCE_RSS_FEEDS.map(feed => ({
          name: feed.name,
          category: feed.category,
        })),
        japan: JAPAN_FINANCE_FEEDS.map(feed => ({
          name: feed.name,
          category: feed.category,
        })),
      },
      totalSources: FINANCE_RSS_FEEDS.length + JAPAN_FINANCE_FEEDS.length,
    })
  );
});
