# Slack連携 完全セットアップガイド

## ✅ 現在の状態

### 動作確認済み
- ✅ Slack Bot Token: 有効
- ✅ Slack Webhook: 有効
- ✅ チーム: AkierX
- ✅ 利用可能なチャンネル: 4個
- ✅ テスト投稿: 成功
- ✅ RSS自動投稿: 成功 (MarketWatchから3件)

### あなたのSlack設定
```
Bot Token: your-slack-bot-token-here
Webhook URL: your-slack-webhook-url-here
チャンネルID (ニュース): your-channel-id-here
```

⚠️ **重要**: これらは機密情報です。公開リポジトリにコミットしないでください！

## 🚀 次のステップ

### ステップ1: Botをチャンネルに招待

Slackの「ニュース」チャンネルで以下を実行：
```
/invite @rss
```

### ステップ2: 手動実行テスト

```bash
cd backend
node cron-rss-to-slack.js
```

または Windows:
```bash
cd backend
run-rss-to-slack.bat
```

結果:
```
📰 MarketWatch から取得中...
✅ 3件の記事を投稿しました
⏳ 2秒待機中...

📰 Bloomberg から取得中...
✅ 3件の記事を投稿しました
⏳ 2秒待機中...

📊 合計 12件の記事を投稿しました
```

### ステップ3: 定期実行の設定

#### Windows (タスクスケジューラ)

1. **タスクスケジューラを開く**
   - Windowsキー + R
   - `taskschd.msc` と入力

2. **新しいタスクを作成**
   - 「タスクの作成」をクリック
   - 名前: `RSS to Slack`
   - 説明: `RSSフィードをSlackに自動投稿`

3. **トリガーを設定**
   - 「トリガー」タブ
   - 「新規」をクリック
   - タスクの開始: `スケジュールに従う`
   - 設定: `毎日`
   - 繰り返し間隔: `1時間`

4. **操作を設定**
   - 「操作」タブ
   - 「新規」をクリック
   - プログラム/スクリプト: `D:\auto-system\auto-trade-system\backend\run-rss-to-slack.bat`
   - 開始: `D:\auto-system\auto-trade-system\backend`

5. **保存**

#### Linux/Mac (cron)

```bash
# crontabを編集
crontab -e

# 1時間ごとに実行
0 * * * * cd /path/to/auto-trade-system/backend && node cron-rss-to-slack.js >> /var/log/rss-to-slack.log 2>&1
```

### ステップ4: サイト設定ページに保存

1. **設定ページを開く**
   - http://localhost:5173/settings

2. **Slack設定を入力**
   ```
   Slack Webhook URL: your-slack-webhook-url-here
   Slack Bot Token: your-slack-bot-token-here
   Slack Channel ID: your-channel-id-here
   ```

3. **設定を保存**

### ステップ5: Slackからサイトに表示 (今後実装)

Botをチャンネルに招待後、以下のAPIで取得可能：

```bash
curl -X POST http://localhost:3001/api/slack-feed/messages \
  -H "Content-Type: application/json" \
  -d '{
    "token": "your-slack-bot-token-here",
    "channel": "your-channel-id-here",
    "limit": 50
  }'
```

## 📊 RSSフィード一覧

現在監視中のフィード (cron-rss-to-slack.js):
1. **MarketWatch** - https://www.marketwatch.com/rss/topstories
2. **Bloomberg** - https://feeds.bloomberg.com/markets/news.rss
3. **CNBC** - https://www.cnbc.com/id/100003114/device/rss/rss.html
4. **Yahoo Finance** - https://finance.yahoo.com/news/rssindex

### フィードの追加方法

`backend/cron-rss-to-slack.js` を編集：

```javascript
const RSS_FEEDS = [
  // ... 既存のフィード
  {
    url: 'YOUR_RSS_FEED_URL',
    name: 'Feed Name',
    maxArticles: 3,
  },
];
```

## 🎯 使用例

### 例1: 毎朝9時にニュースを配信

```javascript
// Windows タスクスケジューラ
// トリガー: 毎日 9:00

// または cron (Linux/Mac)
0 9 * * * cd /path/to/backend && node cron-rss-to-slack.js
```

### 例2: 営業時間中は1時間ごと

```javascript
// cron: 月-金 9:00-17:00 の間、1時間ごと
0 9-17 * * 1-5 cd /path/to/backend && node cron-rss-to-slack.js
```

### 例3: 特定のキーワードのみ

`cron-rss-to-slack.js` をカスタマイズ:

```javascript
// キーワードフィルタリング
const KEYWORDS = ['NVIDIA', 'Tesla', 'Apple', 'Microsoft'];

// フィルタリングロジックを追加
```

## 🔐 セキュリティ対策

### 1. 環境変数で管理 (推奨)

`.env` ファイルを作成:
```
SLACK_BOT_TOKEN=your-slack-bot-token-here
SLACK_WEBHOOK=your-slack-webhook-url-here
SLACK_CHANNEL_ID=your-channel-id-here
```

`.gitignore` に追加:
```
.env
*.bat
cron-rss-to-slack.js
```

`cron-rss-to-slack.js` を更新:
```javascript
require('dotenv').config();

const WEBHOOK = process.env.SLACK_WEBHOOK;
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;
```

### 2. トークンのローテーション

- 定期的 (3ヶ月ごと) にトークンを再生成
- Slack App設定で「Regenerate」

### 3. アクセス制限

- Slack Appの権限を最小限に
- Webhookは特定チャンネルのみ

## 📝 トラブルシューティング

### Q: Slackに投稿できない

**A: 以下を確認**
- Webhook URLが正しいか
- ネットワーク接続
- Slackのレート制限 (1秒に1リクエストまで)

### Q: メッセージを取得できない

**A: 以下を確認**
- Botがチャンネルに招待されているか (`/invite @rss`)
- Bot Tokenが正しいか
- `channels:history` 権限があるか

### Q: 記事が重複投稿される

**A: 対策**
- 投稿済み記事をトラッキング
- データベースやファイルで管理

```javascript
// 例: 投稿済みURLを保存
const fs = require('fs');
const POSTED_FILE = 'posted-urls.json';

function isAlreadyPosted(url) {
  const posted = JSON.parse(fs.readFileSync(POSTED_FILE, 'utf8'));
  return posted.includes(url);
}

function markAsPosted(url) {
  const posted = JSON.parse(fs.readFileSync(POSTED_FILE, 'utf8'));
  posted.push(url);
  fs.writeFileSync(POSTED_FILE, JSON.stringify(posted));
}
```

## 🎉 完了チェックリスト

- [ ] Slackでチャンネルに `/invite @rss` を実行
- [ ] 手動実行テスト成功
- [ ] タスクスケジューラ/cron設定
- [ ] サイト設定ページに保存
- [ ] .gitignoreに機密情報を追加
- [ ] 環境変数で管理 (オプション)

## 📊 期待される結果

### Slackチャンネル「ニュース」
```
🤖 rss (Bot)
━━━━━━━━━━━━━━━━━━━━━
📰 Stock Market Rally Continues
━━━━━━━━━━━━━━━━━━━━━
Market indices hit new highs as investors...

ソース: MarketWatch
投稿日時: 2024/01/20 10:30

[記事を読む]
━━━━━━━━━━━━━━━━━━━━━

🤖 rss (Bot)
━━━━━━━━━━━━━━━━━━━━━
📰 Tech Stocks Surge
━━━━━━━━━━━━━━━━━━━━━
...
```

### サイト (今後実装)
- ニュースページに「Slack」タブ
- Slackチャンネルの投稿を表示
- リアクション、コメントも表示

これでSlack連携の完全なセットアップが完了です！
