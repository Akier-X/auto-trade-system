const fetch = require('node-fetch');
require('dotenv').config();

// Slack設定
const WEBHOOK = process.env.SLACK_WEBHOOK;

// 日本語RSSフィード（厳選）
const JAPAN_RSS_FEEDS = [
  {
    url: 'https://www.nikkei.com/news/feed',
    name: '日本経済新聞',
    maxArticles: 5,
    priority: 'high',
  },
  {
    url: 'https://jp.reuters.com/rssFeed/businessNews',
    name: 'ロイター日本語',
    maxArticles: 5,
    priority: 'high',
  },
  {
    url: 'https://news.yahoo.co.jp/rss/topics/business.xml',
    name: 'Yahoo!ファイナンス',
    maxArticles: 4,
    priority: 'high',
  },
  {
    url: 'https://toyokeizai.net/list/feed/rss',
    name: '東洋経済オンライン',
    maxArticles: 3,
    priority: 'medium',
  },
  {
    url: 'https://diamond.jp/list/feed/rss',
    name: 'ダイヤモンド・オンライン',
    maxArticles: 3,
    priority: 'medium',
  },
  {
    url: 'https://kabutan.jp/news/feed/',
    name: '株探ニュース',
    maxArticles: 3,
    priority: 'medium',
  },
  {
    url: 'https://jp.techcrunch.com/feed/',
    name: 'TechCrunch Japan',
    maxArticles: 2,
    priority: 'low',
  },
  {
    url: 'https://thebridge.jp/feed',
    name: 'THE BRIDGE',
    maxArticles: 2,
    priority: 'low',
  },
];

async function postJapanNewsToSlack() {
  console.log('========================================');
  console.log('📰 日本語ニュース → Slack 自動投稿');
  console.log('開始時刻:', new Date().toLocaleString('ja-JP'));
  console.log('========================================\n');

  let totalPosted = 0;
  const stats = {
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const feed of JAPAN_RSS_FEEDS) {
    try {
      console.log(`📡 ${feed.name} [${feed.priority}] から取得中...`);

      const response = await fetch('http://localhost:3001/api/slack-feed/auto-post-rss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook: WEBHOOK,
          feedUrl: feed.url,
          maxArticles: feed.maxArticles,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log(`   ✅ ${data.posted}件の記事を投稿しました`);
        totalPosted += data.posted;
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

  console.log('\n========================================');
  console.log('📊 投稿完了サマリー');
  console.log('========================================');
  console.log(`合計: ${totalPosted}件`);
  console.log(`  高優先度: ${stats.high}件`);
  console.log(`  中優先度: ${stats.medium}件`);
  console.log(`  低優先度: ${stats.low}件`);
  console.log('========================================');
  console.log('完了時刻:', new Date().toLocaleString('ja-JP'));
  console.log('========================================\n');
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error('❌ 未処理のエラー:', error);
  process.exit(1);
});

// 実行
postJapanNewsToSlack()
  .then(() => {
    console.log('✨ すべての処理が完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 致命的なエラーが発生しました:', error);
    process.exit(1);
  });
