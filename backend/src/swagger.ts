import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Auto Trading System API',
      version: '1.0.0',
      description: `
# Auto Trading System API Documentation

高機能な株式取引管理システムのRESTful APIドキュメントです。

## 主な機能

- 📈 **株式データ管理**: Yahoo Finance APIを使用したリアルタイム株価取得・検索
- 📰 **ニュース統合**: 複数ソースからのマーケットニュース取得
- 📡 **RSSフィード**: 国内外の金融ニュースフィード統合
- 📅 **カレンダー連携**: Google Calendar APIでイベント管理
- 🤖 **AI分析**: Gemini, OpenAI, Claude APIによる株価・ニュース分析
- 🐦 **X監視**: Xアカウント監視とツイート分析
- 💾 **データベース**: TimescaleDBによる時系列データ管理
- 🔔 **通知**: LINE/Slack通知機能
- 🔐 **OAuth認証**: Google Calendar OAuth 2.0対応

## 認証方法

一部のエンドポイント（Google Calendar, X監視等）では、リクエストボディにAPIキーまたはOAuthトークンが必要です。

## エラーレスポンス

すべてのエラーレスポンスは以下の形式で返されます:

\`\`\`json
{
  "success": false,
  "error": "エラーメッセージ",
  "details": "詳細情報",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
\`\`\`

## レート制限

- Yahoo Finance API: 無制限（公開API）
- Google Calendar API: プロジェクトごとの割当
- AI API: プロバイダーごとの制限に準拠
      `,
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
      {
        url: 'http://localhost:3001',
        description: 'Production server (configure in deployment)',
      },
    ],
    tags: [
      {
        name: 'Stock',
        description: '株式データ取得・管理API（Yahoo Finance統合）',
      },
      {
        name: 'News',
        description: 'マーケットニュース取得API',
      },
      {
        name: 'Feeds',
        description: 'RSSフィード統合API',
      },
      {
        name: 'Slack Feed',
        description: 'Slack連携フィードAPI',
      },
      {
        name: 'Calendar',
        description: 'Google Calendar連携API',
      },
      {
        name: 'AI',
        description: 'AI分析API（Gemini, OpenAI, Claude）',
      },
      {
        name: 'X Monitor',
        description: 'Xアカウント監視・分析API',
      },
      {
        name: 'System',
        description: 'システム管理・ログAPI',
      },
      {
        name: 'Notification',
        description: 'LINE/Slack通知API',
      },
      {
        name: 'Google Auth',
        description: 'Google OAuth 2.0認証API',
      },
      {
        name: 'X Auth',
        description: 'X認証管理API',
      },
      {
        name: 'Bookmarks',
        description: 'ブックマークエクスポートAPI',
      },
    ],
    components: {
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'リクエストの成功/失敗',
              example: true,
            },
            data: {
              type: 'object',
              description: 'レスポンスデータ',
            },
            message: {
              type: 'string',
              description: 'メッセージ（任意）',
              example: 'Operation successful',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'タイムスタンプ',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
          required: ['success'],
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              description: 'エラーメッセージ',
              example: 'Bad Request',
            },
            details: {
              type: 'string',
              description: '詳細情報',
              example: 'Invalid parameter',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
          required: ['success', 'error'],
        },
        StockQuote: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: '銘柄コード',
              example: 'AAPL',
            },
            name: {
              type: 'string',
              description: '銘柄名',
              example: 'Apple Inc.',
            },
            price: {
              type: 'number',
              description: '現在価格',
              example: 150.25,
            },
            change: {
              type: 'number',
              description: '変動額',
              example: 2.5,
            },
            changePercent: {
              type: 'number',
              description: '変動率（%）',
              example: 1.69,
            },
            volume: {
              type: 'number',
              description: '出来高',
              example: 50000000,
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'データ取得時刻',
              example: '2024-01-01T15:30:00.000Z',
            },
          },
        },
        NewsArticle: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'ニュースタイトル',
              example: 'Markets rally on strong earnings',
            },
            summary: {
              type: 'string',
              description: '要約',
              example: 'Stock markets surge...',
            },
            url: {
              type: 'string',
              format: 'uri',
              description: '記事URL',
              example: 'https://example.com/article',
            },
            source: {
              type: 'string',
              description: '情報源',
              example: 'Reuters',
            },
            publishedAt: {
              type: 'string',
              format: 'date-time',
              description: '公開日時',
              example: '2024-01-01T10:00:00.000Z',
            },
            imageUrl: {
              type: 'string',
              format: 'uri',
              description: '画像URL',
              example: 'https://example.com/image.jpg',
            },
            relatedTickers: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: '関連銘柄',
              example: ['AAPL', 'MSFT'],
            },
          },
        },
        CalendarEvent: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'イベントID',
              example: 'abc123',
            },
            title: {
              type: 'string',
              description: 'イベントタイトル',
              example: '📈 AAPL 急騰 (+5.2%)',
            },
            description: {
              type: 'string',
              description: '詳細説明',
              example: '銘柄: AAPL\n変動: +7.8 (+5.2%)',
            },
            start: {
              type: 'string',
              format: 'date-time',
              description: '開始時刻',
              example: '2024-01-01T09:00:00.000Z',
            },
            end: {
              type: 'string',
              format: 'date-time',
              description: '終了時刻',
              example: '2024-01-01T10:00:00.000Z',
            },
            category: {
              type: 'string',
              enum: ['trade', 'news', 'trend', 'other'],
              description: 'カテゴリ',
              example: 'trend',
            },
          },
        },
        XTweet: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ツイートID',
              example: '1234567890',
            },
            text: {
              type: 'string',
              description: 'ツイート本文',
              example: 'Market update...',
            },
            author: {
              type: 'string',
              description: '投稿者',
              example: 'market_analyst',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: '投稿日時',
              example: '2024-01-01T08:00:00.000Z',
            },
            likes: {
              type: 'number',
              description: 'いいね数',
              example: 150,
            },
            retweets: {
              type: 'number',
              description: 'リツイート数',
              example: 25,
            },
          },
        },
      },
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API Key for authentication',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'OAuth',
          description: 'OAuth 2.0 Bearer Token',
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'], // Path to the API routes
};

export const swaggerSpec = swaggerJsdoc(options);
