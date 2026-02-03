import { Router } from 'express';
import { asyncHandler, validateRequired } from '../utils/error-handler';
import { ApiResponse } from '../utils/api-response';
import { addSystemLog } from './system';
import { SlackAPIResponse } from '../types/api';

export const slackFeedRouter = Router();

interface SlackMessage {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
  channel?: string;
  user?: string;
  reactions?: string[];
}

// Slack Web API を使ってチャンネルのメッセージを取得
slackFeedRouter.post('/messages', asyncHandler(async (req, res) => {
  const { token, channel, limit = 50 } = req.body;

  validateRequired(req.body, ['token', 'channel']);

  addSystemLog(`Slackチャンネル ${channel} からメッセージを取得中`, 'info');

  // Slack conversations.history API を使用
  const url = `https://slack.com/api/conversations.history?channel=${channel}&limit=${limit}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data: any = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Slack API error');
  }

  // メッセージを記事形式に変換
  const articles: SlackMessage[] = (data.messages || [])
    .filter((msg: any) => msg.text && !msg.subtype) // 通常のメッセージのみ
    .map((msg: any) => {
      // URLを抽出
      const urlMatch = msg.text.match(/<(https?:\/\/[^\s|>]+)(\|[^>]+)?>/);
      const url = urlMatch ? urlMatch[1] : '';

      // タイトルを抽出（最初の行または太字テキスト）
      const titleMatch = msg.text.match(/\*([^*]+)\*/);
      const title = titleMatch ? titleMatch[1] : msg.text.split('\n')[0].substring(0, 100);

      // 画像URLを抽出
      const imageUrl = msg.attachments?.[0]?.image_url || msg.files?.[0]?.url_private;

      // リアクション
      const reactions = msg.reactions?.map((r: any) => r.name) || [];

      return {
        title: title.replace(/<[^>]+>/g, ''), // Slackフォーマットを削除
        summary: msg.text.substring(0, 300).replace(/<[^>]+>/g, ''),
        url: url || `https://app.slack.com/client/${msg.team}/${channel}/thread/${msg.ts}`,
        source: 'Slack',
        publishedAt: new Date(parseFloat(msg.ts) * 1000).toISOString(),
        imageUrl,
        channel,
        user: msg.user,
        reactions,
      };
    });

  addSystemLog(`Slackメッセージ ${articles.length}件を取得`, 'success');

  res.json(
    ApiResponse.success({
      articles,
      count: articles.length,
    })
  );
}));

// RSS記事をSlackに投稿
slackFeedRouter.post('/post-to-slack', asyncHandler(async (req, res) => {
  const { webhook, article } = req.body;

  validateRequired(req.body, ['webhook', 'article']);

  addSystemLog('Slackに記事を投稿中', 'info');

  // Slack Incoming Webhook形式でメッセージを送信
  const slackMessage = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: article.title,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: article.summary || '記事の概要がありません',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*ソース:*\n${article.source}`,
          },
          {
            type: 'mrkdwn',
            text: `*投稿日時:*\n${new Date(article.publishedAt).toLocaleString('ja-JP')}`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '記事を読む',
            },
            url: article.url,
            style: 'primary',
          },
        ],
      },
    ],
  };

  // 画像がある場合は追加
  if (article.imageUrl) {
    slackMessage.blocks.splice(2, 0, {
      type: 'image',
      image_url: article.imageUrl,
      alt_text: article.title,
    } as any);
  }

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slackMessage),
  });

  if (!response.ok) {
    throw new Error('Failed to post to Slack');
  }

  addSystemLog('Slackに記事を投稿完了', 'success', true);

  res.json(
    ApiResponse.success({}, 'Posted to Slack successfully')
  );
}));

// RSSフィードを監視してSlackに自動投稿
slackFeedRouter.post('/auto-post-rss', asyncHandler(async (req, res) => {
  const { webhook, feedUrl, maxArticles = 5 } = req.body;

  validateRequired(req.body, ['webhook', 'feedUrl']);

  addSystemLog(`RSSフィードを監視してSlackに投稿: ${feedUrl}`, 'info');

  // RSS解析
  const Parser = require('rss-parser');
  const parser = new Parser();
  const feed = await parser.parseURL(feedUrl);

  // 最新記事を取得
  const articles = feed.items.slice(0, maxArticles);

  // Slackに順次投稿
  let posted = 0;
  for (const item of articles) {
    try {
      const article = {
        title: item.title || '',
        summary: item.contentSnippet || item.content || item.description || '',
        url: item.link || '',
        source: feed.title || 'RSS Feed',
        publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
        imageUrl: item.enclosure?.url,
      };

      const slackMessage = {
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: article.title.substring(0, 150),
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: article.summary.substring(0, 300),
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `*${article.source}* | ${new Date(article.publishedAt).toLocaleString('ja-JP')}`,
              },
            ],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '記事を読む',
                },
                url: article.url,
                style: 'primary',
              },
            ],
          },
          {
            type: 'divider',
          },
        ],
      };

      if (article.imageUrl) {
        slackMessage.blocks.splice(1, 0, {
          type: 'image',
          image_url: article.imageUrl,
          alt_text: article.title,
        } as any);
      }

      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackMessage),
      });

      posted++;

      // レート制限対策（1秒待機）
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error('Failed to post article:', err);
    }
  }

  addSystemLog(`RSS記事 ${posted}件をSlackに投稿完了`, 'success', true);

  res.json(
    ApiResponse.success({
      posted,
      total: articles.length,
    })
  );
}));

// Slack Botトークンの検証
slackFeedRouter.post('/verify-token', asyncHandler(async (req, res) => {
  const { token } = req.body;

  validateRequired(req.body, ['token']);

  // auth.test APIで検証
  const response = await fetch('https://slack.com/api/auth.test', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data: any = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Invalid token');
  }

  res.json(
    ApiResponse.success({
      team: data.team,
      user: data.user,
      teamId: data.team_id,
      userId: data.user_id,
    })
  );
}));

// チャンネルリストを取得
slackFeedRouter.post('/channels', asyncHandler(async (req, res) => {
  const { token } = req.body;

  validateRequired(req.body, ['token']);

  const response = await fetch('https://slack.com/api/conversations.list', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data: any = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Failed to get channels');
  }

  const channels = (data.channels || []).map((ch: any) => ({
    id: ch.id,
    name: ch.name,
    isPrivate: ch.is_private,
    memberCount: ch.num_members,
  }));

  res.json(
    ApiResponse.success({
      channels,
      count: channels.length,
    })
  );
}));
