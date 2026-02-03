const fetch = require('node-fetch');
require('dotenv').config();

// Slack設定
const WEBHOOK = process.env.SLACK_WEBHOOK;

// 監視するRSSフィード
const RSS_FEEDS = [
  {
    url: 'https://www.marketwatch.com/rss/topstories',
    name: 'MarketWatch',
    maxArticles: 3,
  },
  {
    url: 'https://feeds.bloomberg.com/markets/news.rss',
    name: 'Bloomberg',
    maxArticles: 3,
  },
  {
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    name: 'CNBC',
    maxArticles: 3,
  },
  {
    url: 'https://finance.yahoo.com/news/rssindex',
    name: 'Yahoo Finance',
    maxArticles: 3,
  },
];

async function postRSSToSlack() {
  console.log('========================================');
  console.log('RSS to Slack - 開始:', new Date().toLocaleString('ja-JP'));
  console.log('========================================\n');

  let totalPosted = 0;

  for (const feed of RSS_FEEDS) {
    try {
      console.log(`📰 ${feed.name} から取得中...`);

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
        console.log(`✅ ${data.posted}件の記事を投稿しました`);
        totalPosted += data.posted;
      } else {
        console.error(`❌ エラー: ${data.error}`);
      }

      // レート制限対策（2秒待機）
      console.log('⏳ 2秒待機中...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ ${feed.name} の取得に失敗:`, error.message);
    }
  }

  console.log('\n========================================');
  console.log(`📊 合計 ${totalPosted}件の記事を投稿しました`);
  console.log('========================================');
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error('未処理のエラー:', error);
  process.exit(1);
});

// 実行
postRSSToSlack()
  .then(() => {
    console.log('\n✨ 完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  });
