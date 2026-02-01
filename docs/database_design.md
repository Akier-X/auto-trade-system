# Project Alpha: PostgreSQL データベース設計書

## 概要

このドキュメントは、Project Alphaの中核となるPostgreSQLデータベースの完全な設計書です。マルチソースデータの取得から、複数LLMによる分析、ポートフォリオ最適化までの全プロセスをサポートするテーブル構造を定義しています。

---

## テーブル一覧・概要

| テーブル | 用途 | レコード増加速度 | 重要度 |
|---------|------|-----------------|-------|
| `stocks_master` | 全銘柄マスター | 低（年1回） | ⭐⭐⭐⭐⭐ |
| `raw_tweets` | X投稿の生データ | 高（リアルタイム） | ⭐⭐⭐⭐ |
| `raw_news` | ニュース記事の生データ | 中（1日数十件） | ⭐⭐⭐⭐ |
| `raw_reddit` | Reddit投稿の生データ | 中（1日数百件） | ⭐⭐⭐ |
| `raw_tdnet` | 企業適時開示 | 中（1日数件～数十件） | ⭐⭐⭐⭐ |
| `intelligence_memory` | マルチソース統合メモリ | 高 | ⭐⭐⭐⭐⭐ |
| `monitored_tickers` | 監視対象銘柄リスト | 低～中（増殖的） | ⭐⭐⭐⭐ |
| `analysis_scores` | 各LLMのスコア | 高 | ⭐⭐⭐⭐ |
| `final_consensus` | 複数LLM合議結果 | 高 | ⭐⭐⭐⭐⭐ |
| `portfolio_mgmt` | 資産・配分管理 | 低（更新が多い） | ⭐⭐⭐⭐⭐ |
| `trade_history` | 売買履歴 | 中～高 | ⭐⭐⭐⭐ |
| `source_performance` | 情報源の的中率統計 | 低（定期集計） | ⭐⭐⭐ |

---

## テーブル定義（詳細）

### 1. `stocks_master` - 全銘柄マスター

**目的**: 日本株全銘柄の基本情報を保持。すべての監視・取引の基準となる。

```sql
CREATE TABLE stocks_master (
    ticker_code VARCHAR(10) PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    company_name_en VARCHAR(255),
    sector VARCHAR(100),
    subsector VARCHAR(100),
    market VARCHAR(50),  -- TSE (Tokyo Stock Exchange)
    market_cap BIGINT,   -- 時価総額（円）
    trading_volume BIGINT, -- 直近の売買高
    eps NUMERIC(10,2),   -- 1株当たり利益
    roe NUMERIC(5,2),    -- 自己資本利益率
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_ticker ON stocks_master(ticker_code);
CREATE INDEX idx_company_name ON stocks_master(company_name);
CREATE INDEX idx_sector ON stocks_master(sector);
CREATE INDEX idx_market_cap ON stocks_master(market_cap DESC);
```

**データソース**: JPX（日本取引所グループ）公式リスト、四季報等から定期的に更新

**更新頻度**: 月1回（決算期後）

---

### 2. `raw_tweets` - X投稿の生データ

**目的**: X（Twitter）から取得した生テキストを保存。後段で処理・分析される。

```sql
CREATE TABLE raw_tweets (
    id BIGSERIAL PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL,         -- @username
    account_name VARCHAR(255),                 -- 表示名
    content TEXT NOT NULL,                     -- ツイートテキスト
    url VARCHAR(500),                          -- ツイートURL
    published_at TIMESTAMP,                    -- 投稿日時（X側での時刻）
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 受信日時
    processed BOOLEAN DEFAULT FALSE,           -- 処理済みフラグ
    intelligence_id INTEGER REFERENCES intelligence_memory(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_intelligence FOREIGN KEY (intelligence_id) REFERENCES intelligence_memory(id)
);

-- インデックス
CREATE INDEX idx_raw_tweets_processed ON raw_tweets(processed);
CREATE INDEX idx_raw_tweets_account ON raw_tweets(account_id);
CREATE INDEX idx_raw_tweets_created ON raw_tweets(created_at DESC);
```

**データソース**: IFTTT経由で特定X アカウントから

**データ保持期間**: 1年（古いデータはアーカイブ）

---

### 3. `raw_news` - ニュース記事の生データ

**目的**: ニュースサイト、RSSフィードから取得した記事を保存。

```sql
CREATE TABLE raw_news (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(255) NOT NULL,        -- メディア名（日経、ロイター等）
    source_url VARCHAR(500),                  -- メディアURL
    title VARCHAR(500) NOT NULL,              -- 記事タイトル
    content TEXT,                             -- 記事本文
    article_url VARCHAR(500) NOT NULL,        -- 記事URL
    published_at TIMESTAMP,                   -- 掲載日時
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    intelligence_id INTEGER REFERENCES intelligence_memory(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_raw_news_processed ON raw_news(processed);
CREATE INDEX idx_raw_news_source ON raw_news(source_name);
CREATE INDEX idx_raw_news_created ON raw_news(created_at DESC);
```

**データソース**: Google News API、RSSフィード（日経、ロイター等）

---

### 4. `raw_reddit` - Reddit投稿の生データ

**目的**: Reddit（r/stocks等）から取得した投稿を保存。

```sql
CREATE TABLE raw_reddit (
    id BIGSERIAL PRIMARY KEY,
    subreddit VARCHAR(255) NOT NULL,          -- サブレディット名
    title VARCHAR(500),                       -- スレッドタイトル
    content TEXT,                             -- 投稿内容
    author VARCHAR(255),                      -- 投稿者
    upvotes INTEGER,                          -- アップボート数
    comments_count INTEGER,                   -- コメント数
    reddit_url VARCHAR(500) NOT NULL,
    published_at TIMESTAMP,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    intelligence_id INTEGER REFERENCES intelligence_memory(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_raw_reddit_processed ON raw_reddit(processed);
CREATE INDEX idx_raw_reddit_subreddit ON raw_reddit(subreddit);
CREATE INDEX idx_raw_reddit_created ON raw_reddit(created_at DESC);
```

---

### 5. `raw_tdnet` - 企業適時開示

**目的**: JPX TDnet（企業の重大発表）から取得した開示情報を保存。

```sql
CREATE TABLE raw_tdnet (
    id BIGSERIAL PRIMARY KEY,
    ticker_code VARCHAR(10) NOT NULL REFERENCES stocks_master(ticker_code),
    disclosure_type VARCHAR(100),             -- 決算短信、重要事項等
    title VARCHAR(500) NOT NULL,
    content TEXT,
    disclosure_url VARCHAR(500),
    published_at TIMESTAMP NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    intelligence_id INTEGER REFERENCES intelligence_memory(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_raw_tdnet_ticker ON raw_tdnet(ticker_code);
CREATE INDEX idx_raw_tdnet_published ON raw_tdnet(published_at DESC);
CREATE INDEX idx_raw_tdnet_processed ON raw_tdnet(processed);
```

---

### 6. `intelligence_memory` - マルチソース統合メモリ

**最重要テーブル**: すべての分析の「単一の情報源」となる。raw_* テーブルから処理されたデータがここに統合される。

```sql
CREATE TABLE intelligence_memory (
    id BIGSERIAL PRIMARY KEY,

    -- 情報源の特定
    ticker_code VARCHAR(10) REFERENCES stocks_master(ticker_code),
    source_type VARCHAR(20) NOT NULL,        -- 'X', 'NEWS', 'REDDIT', 'TDNET'
    source_id BIGINT,                         -- raw_tweets.id / raw_news.id 等
    source_user VARCHAR(255),                 -- 投稿者・メディア名
    source_credibility NUMERIC(3,2),         -- その情報源の信頼度（0.0-1.0）

    -- テキスト・コンテンツ
    original_text TEXT NOT NULL,              -- 元テキスト
    content_summary VARCHAR(1000),            -- 要約（LLMが生成）

    -- ベクトル化（RAG用）
    embedding vector(1536),                   -- OpenAI embedding

    -- メタデータ
    published_at TIMESTAMP,                   -- 元データの公開日時
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    analyzed_at TIMESTAMP,                    -- 分析実施日時

    -- 処理フラグ
    is_verified BOOLEAN DEFAULT FALSE,        -- 真偽確認済みフラグ
    is_executed BOOLEAN DEFAULT FALSE,        -- 売買実行フラグ

    -- タグ
    tags TEXT[],                              -- 【重要】【警告】等のタグ

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- インデックス（検索性能を大幅に向上）
CREATE INDEX idx_intelligence_ticker ON intelligence_memory(ticker_code);
CREATE INDEX idx_intelligence_source_type ON intelligence_memory(source_type);
CREATE INDEX idx_intelligence_analyzed ON intelligence_memory(analyzed_at DESC);
CREATE INDEX idx_intelligence_embedding ON intelligence_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_intelligence_published ON intelligence_memory(published_at DESC);
```

**重要**: このテーブルは整合性の中核。各raw_*テーブルから1つのレコードが作成される。

---

### 7. `monitored_tickers` - 監視対象銘柄リスト

**目的**: 「一度見つかった銘柄は永久に監視し続ける」メモリ構造。AIが自動的に銘柄を発見・追加。

```sql
CREATE TABLE monitored_tickers (
    ticker_code VARCHAR(10) PRIMARY KEY REFERENCES stocks_master(ticker_code),

    -- 発見・更新情報
    first_detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    first_detected_source VARCHAR(20),       -- 最初に見つかったメディア
    detection_count INTEGER DEFAULT 1,       -- 言及された回数
    last_mentioned_at TIMESTAMP,

    -- 監視レベル
    priority_level INTEGER DEFAULT 1,        -- 1=広域, 2=重点, 3=集中
    is_active BOOLEAN DEFAULT TRUE,

    -- 過去の成績
    accuracy_rate NUMERIC(3,2),              -- この銘柄での的中率（0.0-1.0）
    avg_return NUMERIC(6,3),                 -- 平均リターン（%）

    -- メモ・備考
    notes TEXT,
    tags TEXT[],

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_monitored_priority ON monitored_tickers(priority_level);
CREATE INDEX idx_monitored_accuracy ON monitored_tickers(accuracy_rate DESC);
CREATE INDEX idx_monitored_active ON monitored_tickers(is_active);
```

---

### 8. `analysis_scores` - 各LLMのスコアリング結果

**目的**: 複数のLLM（Gemini、GPT、Claude）がそれぞれどう判定したかを記録。

```sql
CREATE TABLE analysis_scores (
    id BIGSERIAL PRIMARY KEY,

    -- 関連データ
    intelligence_id BIGINT NOT NULL REFERENCES intelligence_memory(id),

    -- LLMの特定
    model_name VARCHAR(50) NOT NULL,         -- 'gpt-4o', 'claude-3.5-sonnet', 'gemini-1.5-pro'
    model_version VARCHAR(100),

    -- 抽出された情報
    extracted_tickers VARCHAR(10)[],         -- 抽出された銘柄コード（複数可）
    extracted_sentiment VARCHAR(20),          -- 'POSITIVE', 'NEGATIVE', 'NEUTRAL'

    -- スコアリング
    veracity_score NUMERIC(5,2),             -- 真実性スコア（0-100）
    logic_score NUMERIC(5,2),                -- 論理整合性スコア（0-100）
    confidence_score NUMERIC(3,2),           -- 信頼度（0.0-1.0）

    -- リスク検知
    detected_risks TEXT[],                   -- 検知されたリスク項目
    manipulation_risk BOOLEAN,               -- 意図的な煽りか？
    insider_risk BOOLEAN,                    -- インサイダー情報の可能性？

    -- 推論プロセス
    reasoning_text TEXT,                     -- AIの判定根拠（長文）
    json_output JSONB,                       -- LLMの完全な出力（JSON）

    -- タイムスタンプ
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_analysis_intelligence ON analysis_scores(intelligence_id);
CREATE INDEX idx_analysis_model ON analysis_scores(model_name);
CREATE INDEX idx_analysis_veracity ON analysis_scores(veracity_score DESC);
```

**注**: 1つの `intelligence_memory` に対して、通常3つ（GPT、Claude、Gemini）のレコードが作成される。

---

### 9. `final_consensus` - 複数LLM合議結果

**最終判定テーブル**: 複数LLMの結果を統計的に統合し、「投資判定」を決定。

```sql
CREATE TABLE final_consensus (
    id BIGSERIAL PRIMARY KEY,

    intelligence_id BIGINT NOT NULL REFERENCES intelligence_memory(id),

    -- 統合スコア
    aggregated_score NUMERIC(5,2),           -- 複数モデルの平均スコア（0-100）
    standard_deviation NUMERIC(5,2),         -- スコアのばらつき（低いほど確実）
    agreement_level VARCHAR(20),             -- 'HIGH', 'MEDIUM', 'LOW'

    -- 最終判定
    final_decision VARCHAR(50) NOT NULL,     -- 'STRONG_BUY', 'BUY', 'HOLD', 'WATCH', 'REJECT'
    action_signal VARCHAR(20),               -- 'EXECUTE', 'WATCH', 'IGNORE'

    -- 詳細情報
    primary_ticker VARCHAR(10),              -- メイン対象銘柄
    secondary_tickers VARCHAR(10)[],         -- サブ対象銘柄

    -- 根拠・推論
    reasoning_summary TEXT,                  -- 最終判定の要約説明
    supporting_models TEXT[],                -- 判定を支持したモデル（3つのうちどれか）

    -- メモリ・コンテキスト
    related_intelligence_ids BIGINT[],       -- 参照した過去のintelligence_id
    memory_context TEXT,                     -- 過去データから抽出されたコンテキスト

    -- 期待値
    expected_return NUMERIC(6,3),            -- 期待リターン（%）
    expected_risk NUMERIC(6,3),              -- 期待リスク（下落率%）
    confidence_score NUMERIC(3,2),           -- 総合的な信頼度（0.0-1.0）

    -- フラグ
    is_executed BOOLEAN DEFAULT FALSE,       -- 実行済みフラグ
    execution_time TIMESTAMP,                -- 実行日時

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_consensus_intelligence ON final_consensus(intelligence_id);
CREATE INDEX idx_consensus_decision ON final_consensus(final_decision);
CREATE INDEX idx_consensus_executed ON final_consensus(is_executed);
CREATE INDEX idx_consensus_primary_ticker ON final_consensus(primary_ticker);
CREATE INDEX idx_consensus_created ON final_consensus(created_at DESC);
```

---

### 10. `portfolio_mgmt` - 資産・ポートフォリオ管理

**目的**: 現在の保有資産、配分、リスク制限を管理。売買エンジンが参照。

```sql
CREATE TABLE portfolio_mgmt (
    id BIGSERIAL PRIMARY KEY,

    -- 資産状況
    total_assets NUMERIC(15,2) NOT NULL,     -- 総資産額（円）
    available_cash NUMERIC(15,2),            -- 利用可能現金
    holding_value NUMERIC(15,2),             -- 保有株式の評価額

    -- 戦略別配分
    short_term_ratio NUMERIC(3,2),           -- 短期トレード割合（%）
    long_term_ratio NUMERIC(3,2),            -- 長期保有割合（%）
    cash_reserve_ratio NUMERIC(3,2),         -- 予備金割合（%）

    -- リスク管理
    max_loss_per_trade NUMERIC(3,2),         -- 1回あたりの最大損失率（%）
    max_loss_daily NUMERIC(3,2),             -- 1日あたりの最大損失率（%）
    max_position_size NUMERIC(3,2),          -- 1銘柄あたりの最大ポジション（%）

    -- パフォーマンス
    daily_return NUMERIC(6,3),               -- 本日のリターン（%）
    monthly_return NUMERIC(6,3),             -- 今月のリターン（%）
    ytd_return NUMERIC(6,3),                 -- 年初来のリターン（%）
    total_return NUMERIC(7,3),               -- 累計リターン（%）

    -- 取引統計
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    win_rate NUMERIC(3,2),
    avg_win NUMERIC(6,3),
    avg_loss NUMERIC(6,3),

    -- 更新情報
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**重要**: このテーブルは通常1行のみ。定期的に更新される。

---

### 11. `trade_history` - 売買履歴

**目的**: すべての売買を記録。バックテストやパフォーマンス分析に使用。

```sql
CREATE TABLE trade_history (
    id BIGSERIAL PRIMARY KEY,

    -- 銘柄・タイミング
    ticker_code VARCHAR(10) NOT NULL REFERENCES stocks_master(ticker_code),
    order_type VARCHAR(20) NOT NULL,         -- 'BUY', 'SELL'

    -- 約定情報
    entry_price NUMERIC(10,2),               -- 買値/売値
    entry_quantity INTEGER,                  -- 数量
    entry_time TIMESTAMP NOT NULL,

    -- 決済（売りの場合のみ）
    exit_price NUMERIC(10,2),
    exit_time TIMESTAMP,

    -- リターン計算
    pnl NUMERIC(15,2),                       -- 損益（円）
    pnl_ratio NUMERIC(6,3),                  -- 損益率（%）

    -- シグナル情報
    consensus_id BIGINT REFERENCES final_consensus(id),
    confidence_score NUMERIC(3,2),           -- 売買判断の信頼度

    -- 自動売買エンジン情報
    strategy_used VARCHAR(100),              -- 使用した戦略（短期/長期）
    kelly_fraction NUMERIC(3,2),             -- ケリー基準での配分比率

    -- ステータス
    status VARCHAR(20) DEFAULT 'OPEN',       -- 'OPEN', 'CLOSED', 'CANCELLED'

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_trade_ticker ON trade_history(ticker_code);
CREATE INDEX idx_trade_entry_time ON trade_history(entry_time DESC);
CREATE INDEX idx_trade_exit_time ON trade_history(exit_time DESC);
CREATE INDEX idx_trade_status ON trade_history(status);
CREATE INDEX idx_trade_pnl ON trade_history(pnl_ratio DESC);
```

---

### 12. `source_performance` - 情報源の的中率統計

**目的**: 各情報源（アカウント、メディア）の過去の的中率を記録。重み付けに使用。

```sql
CREATE TABLE source_performance (
    id BIGSERIAL PRIMARY KEY,

    -- 情報源の特定
    source_type VARCHAR(20) NOT NULL,        -- 'X_ACCOUNT', 'NEWS_SITE', 'REDDIT'
    source_name VARCHAR(255) NOT NULL,

    -- 統計
    total_signals INTEGER DEFAULT 0,         -- 発信したシグナル総数
    correct_signals INTEGER DEFAULT 0,       -- 的中したシグナル数
    accuracy_rate NUMERIC(3,2),              -- 的中率（0.0-1.0）

    avg_return NUMERIC(6,3),                 -- 平均リターン（%）
    sharpe_ratio NUMERIC(5,3),               -- シャープレシオ

    -- 更新情報
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_source_performance_accuracy ON source_performance(accuracy_rate DESC);
```

---

## ビュー（仮想テーブル）

### ビュー1: `vw_active_opportunities`

現在監視中で、かつ売買シグナルが出ている銘柄。

```sql
CREATE VIEW vw_active_opportunities AS
SELECT
    fc.primary_ticker,
    sm.company_name,
    fc.final_decision,
    fc.aggregated_score,
    fc.confidence_score,
    fc.expected_return,
    fc.expected_risk,
    COUNT(*) as signal_count,
    MAX(fc.created_at) as latest_signal
FROM final_consensus fc
JOIN stocks_master sm ON fc.primary_ticker = sm.ticker_code
WHERE
    fc.final_decision IN ('STRONG_BUY', 'BUY')
    AND fc.is_executed = FALSE
    AND fc.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY fc.primary_ticker, sm.company_name, fc.final_decision,
         fc.aggregated_score, fc.confidence_score, fc.expected_return, fc.expected_risk;
```

### ビュー2: `vw_portfolio_summary`

現在のポートフォリオサマリー。

```sql
CREATE VIEW vw_portfolio_summary AS
SELECT
    pm.total_assets,
    pm.available_cash,
    pm.holding_value,
    pm.daily_return,
    pm.monthly_return,
    pm.ytd_return,
    pm.total_return,
    pm.win_rate,
    COUNT(DISTINCT CASE WHEN th.status = 'CLOSED' THEN th.id END) as closed_trades,
    ROUND(AVG(th.pnl_ratio), 2) as avg_return_per_trade
FROM portfolio_mgmt pm
LEFT JOIN trade_history th ON 1=1
GROUP BY pm.id, pm.total_assets, pm.available_cash, pm.holding_value,
         pm.daily_return, pm.monthly_return, pm.ytd_return, pm.total_return, pm.win_rate;
```

---

## データベース作成・初期化スクリプト

```sql
-- 1. 拡張機能の有効化
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- 全文検索用

-- 2. すべてのテーブル作成（上記の定義を実行）
-- ... （上記の CREATE TABLE文をここに挿入）

-- 3. インデックス・ビュー作成
-- ... （上記のCREATE INDEX、CREATE VIEWをここに挿入）

-- 4. 初期データ投入
-- stocks_master にJPXの全銘柄をインポート
COPY stocks_master (ticker_code, company_name, sector, market_cap)
FROM '/path/to/stocks_master.csv'
WITH (FORMAT csv, HEADER true);

-- 5. シーケンスのリセット
SELECT setval('raw_tweets_id_seq', (SELECT MAX(id) FROM raw_tweets) + 1);
SELECT setval('intelligence_memory_id_seq', (SELECT MAX(id) FROM intelligence_memory) + 1);
```

---

## バックアップ・復旧戦略

### 毎日のバックアップ

```bash
# 毎晩2:00 AM に実行
0 2 * * * pg_dump -U admin -d alpha_db -Fc > /backups/alpha_db_$(date +\%Y\%m\%d).dump
```

### 復旧手順

```bash
pg_restore -U admin -d alpha_db -v /backups/alpha_db_20240201.dump
```

---

## パフォーマンス最適化のポイント

1. **インデックス戦略**: 検索頻度が高い列（ticker_code、created_at）に必ずインデックスを張る
2. **パーティショニング**: `raw_tweets` など大規模テーブルは日付でパーティション分割
3. **統計情報更新**: 定期的に `ANALYZE` コマンドでPostgreSQLの最適化情報を更新
4. **接続プーリング**: PgBouncer等で接続数を制限

---

## セキュリティ設定

```sql
-- ユーザーの作成
CREATE USER app_user WITH PASSWORD 'secure_password';

-- テーブルへのアクセス権付与
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;

-- シーケンス（ID自動採番）への権限
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

---

## まとめ

このデータベース設計は、以下を実現する：

1. **マルチソース統合**: X、ニュース、Reddit、適時開示を1つのプラットフォームで管理
2. **複数LLM合議制**: 各LLMの判定を独立して保存し、統計的に統合
3. **永続的メモリ**: 過去のデータとベクトル化により、銘柄ごとの「学習」を実現
4. **ポートフォリオ最適化**: リスク管理と収益化を同時に実現
5. **監査・バックテスト**: すべての決定根拠がDBに記録され、後から検証可能

---

**最終更新**: 2026年2月
**データベース: PostgreSQL 13+**
**pgvector拡張: 必須**
