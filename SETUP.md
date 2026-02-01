# Project Alpha: Git Bash セットアップガイド

このドキュメントは、Project Alpha を Git Bash 環境で構築する際の手順を記載しています。

## 前提条件

- **Git Bash** （https://git-scm.com/ からインストール）
- Python 3.10以上
- PostgreSQL 13以上（またはSupabase無料枠）

## ステップ1：自動セットアップ（推奨）

```bash
# リポジトリをクローン
git clone https://github.com/Akier-X/auto-trade-system.git
cd auto-trade-system

# セットアップスクリプトを実行
chmod +x scripts/setup.sh
./scripts/setup.sh
```

スクリプトが以下を自動実行：
- Python 仮想環境の作成
- 依存パッケージのインストール
- .env ファイルの作成
- Git リポジトリの確認
- セットアップ完了メッセージ表示

スクリプト実行後、.env ファイルを編集して API キーを設定してください。

## ステップ2：手動セットアップ（スクリプト実行できない場合）

```bash
# リポジトリをクローン
git clone https://github.com/Akier-X/auto-trade-system.git
cd auto-trade-system

# 仮想環境を作成
python -m venv venv

# 仮想環境を有効化（Git Bash）
source venv/Scripts/activate

# 依存パッケージをインストール
pip install -r requirements.txt
```

## ステップ3：環境変数設定

```bash
# テンプレートから .env を作成
cp config/.env.example .env

# .env を開いて、各設定値を入力
nano .env  # または code .env で VS Code で編集
```

### 重要な設定項目

**PostgreSQL接続情報**:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=alpha_db
DB_USER=app_user
DB_PASSWORD=your_password
```

**LLM APIキー**:
```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
```

**証券会社APIキー** (本番運用時):
```
KABU_API_KEY=...
IB_ACCOUNT_ID=...
```

## ステップ4：PostgreSQL環境構築

### オプションA：ローカルPostgreSQL（推奨・開発環境）

```bash
# macOS (Homebrew)
brew install postgresql
brew services start postgresql

# Linux (Ubuntu/Debian)
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql

# Windows
# https://www.postgresql.org/download/windows/ からインストーラをダウンロード
```

### オプションB：Supabase（クラウド・本番環境）

1. https://supabase.com にアクセス
2. 新規プロジェクト作成
3. 接続情報（DB_HOST, DB_NAME等）を .env に記入
4. pgvector拡張を有効化（Supabase UI上）

## ステップ4：データベース初期化

```bash
# PostgreSQL に接続（ローカルの場合）
psql -U postgres

# Database作成
CREATE DATABASE alpha_db;

# ユーザー作成
CREATE USER app_user WITH PASSWORD 'your_password';

# 権限付与
ALTER ROLE app_user CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE alpha_db TO app_user;

# exit
\q
```

## ステップ5：テーブル作成

```bash
# テーブルDDLを実行
psql -U app_user -d alpha_db -f src/storage/queries.sql

# または、Pythonスクリプトで実行
python scripts/init_database.py
```

## ステップ6：IFTTT設定

### Xアカウント監視の設定

1. https://ifttt.com にアクセス → アカウント作成
2. 「Create Applet」をクリック
3. Trigger: 「Twitter → New tweet by a specific user」
4. アクション: 「Webhooks → Make a web request」
5. URL: `https://your-server.com/webhook/x`
6. Method: POST
7. Content Type: application/json

詳細は → [docs/api_integration.md](docs/api_integration.md)

## ステップ7：アプリケーション起動テスト

```bash
# Webhook サーバー起動（テスト用）
python src/ingestion/webhook_server.py

# 別のターミナルで
# ヘルスチェック
curl http://localhost:5000/health

# 終了
Ctrl+C
```

## ステップ8：スケジューラ確認

```bash
# メインオーケストレータでスケジューラを起動
python src/main.py

# ログを確認
tail -f logs/app.log
```

## トラブルシューティング

### PostgreSQL接続エラー

```
psycopg2.OperationalError: could not connect to server
```

**解決策**:
- PostgreSQLが起動しているか確認: `pg_isready`
- 接続情報（DB_HOST, DB_USER, DB_PASSWORD）を確認
- Supabseを使用している場合、ファイアウォール設定を確認

### LLM API エラー

```
openai.error.RateLimitError
```

**解決策**:
- APIキーが正しく設定されているか確認
- APIプランの上限に達していないか確認
- retry logic がテナシティで自動化されます

### IFTTT連携の問題

```
POST /webhook/x → 502 Bad Gateway
```

**解決策**:
- ngrokまたはクラウドサーバーがオンラインか確認
- Flaskサーバーが起動しているか確認
- ファイアウォール・ルーターのポート設定を確認

## 本番環境での推奨設定

```bash
# .env に本番設定
PRODUCTION_MODE=True

# DBサーバーはSupabse等でホスト
DB_HOST=xxxxx.supabase.co

# Webhook サーバーはクラウド（Render、Heroku等）でホスト
# → 24時間稼働可能

# ログはロギングサービス（例: Loki）に送信
```

## 次のステップ

- ロードマップを確認: [ROADMAP.md](ROADMAP.md)
- データベース設計を理解: [docs/database_design.md](docs/database_design.md)
- システムアーキテクチャを学習: [docs/system_architecture.md](docs/system_architecture.md)

---

**作成日**: 2026年2月
**バージョン**: 1.0.0
