const fetch = require('node-fetch');
require('dotenv').config();

// Slack設定
const WEBHOOK = process.env.SLACK_WEBHOOK;

// 株関連キーワード（日本語・英語）
const STOCK_KEYWORDS = [
  // 日本語キーワード
  '株価', '決算', '業績', '売上', '利益', '増益', '減益', '上場', '株式', '銘柄',
  '東証', '日経平均', 'TOPIX', '市場', '投資', '買い', '売り', 'PER', 'PBR',
  'IR', '配当', '株主', '増配', '減配', '自社株買い', 'M&A', '買収', '合併',

  // 英語キーワード
  'stock', 'earnings', 'revenue', 'profit', 'EPS', 'dividend', 'shares',
  'IPO', 'market', 'trading', 'investors', 'acquisition', 'merger',
  'bullish', 'bearish', 'rally', 'correction', 'volatility',

  // 企業・セクター
  'Apple', 'Microsoft', 'Google', 'Amazon', 'Tesla', 'NVIDIA', 'Meta',
  'トヨタ', 'ソニー', '任天堂', 'ソフトバンク', 'NTT', 'KDDI', 'キーエンス',
  '半導体', 'AI', 'クラウド', 'EV', '電気自動車', '自動運転',

  // 経済指標
  'GDP', 'CPI', 'インフレ', '金利', 'FRB', 'Fed', '日銀', 'BOJ',
  '雇用統計', '失業率', '金融政策', '量的緩和'
];

// 除外キーワード（ノイズを減らす）
const EXCLUDE_KEYWORDS = [
  'スポーツ', 'サッカー', '野球', '芸能', '天気', '事故', '事件',
  'sports', 'weather', 'entertainment', 'celebrity'
];

// 優先度が高いキーワード（これらを含む記事は必ず投稿）
const HIGH_PRIORITY_KEYWORDS = [
  '決算', 'earnings', '業績予想', '増益', '減益', 'IPO', '上場',
  '自社株買い', 'buyback', 'M&A', '買収', 'merger', 'acquisition',
  '配当', 'dividend', 'FRB', 'Fed', '日銀', 'BOJ', '金融政策'
];

// RSSフィード（株関連に最適化）
const STOCK_NEWS_FEEDS = [
  // グローバル金融ニュース
  {
    url: 'https://www.marketwatch.com/rss/topstories',
    name: 'MarketWatch',
    maxArticles: 5,
    priority: 'high',
  },
  {
    url: 'https://feeds.bloomberg.com/markets/news.rss',
    name: 'Bloomberg Markets',
    maxArticles: 5,
    priority: 'high',
  },
  {
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    name: 'CNBC',
    maxArticles: 4,
    priority: 'high',
  },
  {
    url: 'https://finance.yahoo.com/news/rssindex',
    name: 'Yahoo Finance',
    maxArticles: 4,
    priority: 'high',
  },

  // 日本の株式ニュース
  {
    url: 'https://www.nikkei.com/news/feed',
    name: '日本経済新聞',
    maxArticles: 5,
    priority: 'high',
  },
  {
    url: 'https://jp.reuters.com/rssFeed/businessNews',
    name: 'ロイター日本語',
    maxArticles: 4,
    priority: 'high',
  },
  {
    url: 'https://news.yahoo.co.jp/rss/topics/business.xml',
    name: 'Yahoo!ファイナンス',
    maxArticles: 4,
    priority: 'high',
  },
  {
    url: 'https://kabutan.jp/news/feed/',
    name: '株探ニュース',
    maxArticles: 4,
    priority: 'medium',
  },
  {
    url: 'https://toyokeizai.net/list/feed/rss',
    name: '東洋経済オンライン',
    maxArticles: 3,
    priority: 'medium',
  },
];

/**
 * テキストが株関連かどうかを判定
 */
function isStockRelated(text) {
  // 除外キーワードチェック
  const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(keyword =>
    text.toLowerCase().includes(keyword.toLowerCase())
  );
  if (hasExcludeKeyword) return false;

  // 株関連キーワードチェック
  const matchedKeywords = STOCK_KEYWORDS.filter(keyword =>
    text.toLowerCase().includes(keyword.toLowerCase())
  );

  return matchedKeywords.length > 0;
}

/**
 * 優先度を計算
 */
function calculatePriority(text) {
  const highPriorityMatches = HIGH_PRIORITY_KEYWORDS.filter(keyword =>
    text.toLowerCase().includes(keyword.toLowerCase())
  );

  const stockKeywordMatches = STOCK_KEYWORDS.filter(keyword =>
    text.toLowerCase().includes(keyword.toLowerCase())
  );

  if (highPriorityMatches.length > 0) {
    return { score: 100 + highPriorityMatches.length * 10, level: 'high' };
  } else if (stockKeywordMatches.length >= 3) {
    return { score: 50 + stockKeywordMatches.length * 5, level: 'medium' };
  } else if (stockKeywordMatches.length >= 1) {
    return { score: 20 + stockKeywordMatches.length * 5, level: 'low' };
  }

  return { score: 0, level: 'none' };
}

/**
 * 株関連ニュースを自動投稿
 */
async function postStockNewsToSlack() {
  const startTime = new Date();
  console.log('========================================');
  console.log('📈 株関連ニュース → Slack 自動投稿');
  console.log('開始時刻:', startTime.toLocaleString('ja-JP'));
  console.log('========================================\n');

  let totalPosted = 0;
  let totalFiltered = 0;
  const stats = {
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const feed of STOCK_NEWS_FEEDS) {
    try {
      console.log(`📡 ${feed.name} [${feed.priority}] から取得中...`);

      const response = await fetch('http://localhost:3001/api/slack-feed/auto-post-rss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook: WEBHOOK,
          feedUrl: feed.url,
          maxArticles: feed.maxArticles,
          filterFunction: (article) => {
            const fullText = `${article.title} ${article.contentSnippet || article.description || ''}`;
            const isRelated = isStockRelated(fullText);

            if (isRelated) {
              const priority = calculatePriority(fullText);
              article.calculatedPriority = priority;
              return true;
            }
            return false;
          },
        }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`   ✅ ${data.posted}件の記事を投稿しました`);
        console.log(`   📊 ${data.filtered || 0}件が株関連として選別されました`);

        totalPosted += data.posted;
        totalFiltered += data.filtered || 0;
        stats[feed.priority] += data.posted;
      } else {
        console.error(`   ❌ エラー: ${data.error}`);
      }

      // レート制限対策
      const waitTime = feed.priority === 'high' ? 3000 : 2000;
      console.log(`   ⏳ ${waitTime / 1000}秒待機中...\n`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } catch (error) {
      console.error(`❌ ${feed.name} の取得に失敗:`, error.message);
    }
  }

  const endTime = new Date();
  const duration = Math.round((endTime - startTime) / 1000);

  console.log('\n========================================');
  console.log('📊 投稿完了サマリー');
  console.log('========================================');
  console.log(`処理時間: ${duration}秒`);
  console.log(`フィルタリング済み: ${totalFiltered}件`);
  console.log(`投稿済み: ${totalPosted}件`);
  console.log(`  高優先度: ${stats.high}件`);
  console.log(`  中優先度: ${stats.medium}件`);
  console.log(`  低優先度: ${stats.low}件`);
  console.log('========================================');
  console.log('完了時刻:', endTime.toLocaleString('ja-JP'));
  console.log('========================================\n');

  return {
    totalPosted,
    totalFiltered,
    stats,
    duration,
  };
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error('❌ 未処理のエラー:', error);
  process.exit(1);
});

// 実行
if (require.main === module) {
  postStockNewsToSlack()
    .then((result) => {
      console.log('✨ すべての処理が完了しました');

      // 結果をファイルに保存（履歴として）
      const fs = require('fs');
      const logFile = 'stock-news-log.json';

      try {
        let logs = [];
        if (fs.existsSync(logFile)) {
          logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        }

        logs.push({
          timestamp: new Date().toISOString(),
          ...result,
        });

        // 最新100件のみ保持
        if (logs.length > 100) {
          logs = logs.slice(-100);
        }

        fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
        console.log(`📝 実行ログを保存しました: ${logFile}`);
      } catch (error) {
        console.error('ログ保存に失敗:', error.message);
      }

      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 致命的なエラーが発生しました:', error);
      process.exit(1);
    });
}

module.exports = { postStockNewsToSlack, isStockRelated, calculatePriority };
