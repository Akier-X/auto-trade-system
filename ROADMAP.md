# Project Alpha: 詳細実装ロードマップ

## 全体スケジュール概要

| フェーズ | 期間 | 主要タスク | 成果物 |
|---------|------|----------|-------|
| Phase 1 | Week 1-2 | PostgreSQL基盤構築 | DB環境・stocks_master |
| Phase 2 | Week 3-4 | マルチソースデータ取得 | Webhook×3、取得パイプライン |
| Phase 3 | Week 5-7 | AI分析エンジン | 複数LLM統合・合議制 |
| Phase 4 | Week 8-9 | メモリ化・RAG実装 | pgvector・文脈検索 |
| Phase 5 | Week 10-12 | 自動売買実装 | 最適化エンジン・証券API |

---

## Phase 1: PostgreSQL基盤構築（Week 1-2）

### 1-1. PostgreSQL環境構築
**目標**: 本番レベルのPostgreSQL環境整備

**タスク**:
- [ ] ローカルPostgreSQL または Supabase無料枠でDB作成
- [ ] 接続テスト（Python psycopg2）
- [ ] バックアップ戦略定義
- [ ] ユーザー・ロール・権限設定

**出力ファイル**:
- `config/db_config.yaml`（DB接続情報）
- `src/storage/db_manager.py`（DB操作クラス）

**完了条件**:
```python
# db_manager.py で以下が動作する
from src.storage.db_manager import DatabaseManager
db = DatabaseManager()
db.test_connection()  # OK出力
```

---

### 1-2. stocks_master テーブル作成・データ投入
**目標**: 全銘柄（約3,800銘柄）のマスターデータをDB化

**タスク**:
- [ ] JPX公式から全銘柄リスト（CSV）取得
- [ ] テーブルDDL作成（定義）
- [ ] CSVデータのPostgreSQLへのインポート
- [ ] インデックス作成（検索高速化）

**テーブル定義**:
```sql
CREATE TABLE stocks_master (
    ticker_code VARCHAR(10) PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    sector VARCHAR(100),
    subsector VARCHAR(100),
    market_cap BIGINT,
    trading_volume BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_company_name ON stocks_master(company_name);
CREATE INDEX idx_sector ON stocks_master(sector);
```

**出力ファイル**:
- `src/storage/queries.sql`（全テーブル定義）
- `scripts/import_stocks_master.py`（インポートスクリプト）

---

### 1-3. 基盤テーブル設計・作成
**目標**: 全テーブル構造を定義し、Phase 2以降の受け皿を完成させる

**テーブル一覧**:

| テーブル名 | 用途 | 主キー | 関連テーブル |
|-----------|------|-------|------------|
| `raw_tweets` | X投稿の生データ保存 | id | intelligence_memory |
| `raw_news` | ニュース記事の生データ | id | intelligence_memory |
| `raw_reddit` | Reddit投稿の生データ | id | intelligence_memory |
| `intelligence_memory` | マルチソース統合メモリ | id | stocks_master, analysis_scores |
| `monitored_tickers` | 監視対象銘柄の動的リスト | ticker_code | stocks_master |
| `analysis_scores` | 各LLMのスコアリング結果 | id | intelligence_memory |
| `final_consensus` | 複数LLMの合議結果 | id | intelligence_memory |
| `portfolio_mgmt` | 資産・配分管理 | id | None |
| `trade_history` | 売買履歴 | id | monitored_tickers |

**出力ファイル**:
- `docs/database_design.md`（詳細設計ドキュメント）
- `src/storage/queries.sql`（全DDL）

---

## Phase 2: マルチソースデータ取得（Week 3-4）

### 2-1. X（Twitter）データ取得パイプライン
**目標**: IFTTT経由で特定アカウントの投稿を自動取得

**実装内容**:

1. **Python Webhookサーバー構築**
   - Flask/FastAPIで HTTP POST受信エンドポイント作成
   - IFTTTからのデータを受け取り、`raw_tweets` に保存

**ファイル**: `src/ingestion/webhook_server.py`

```python
from flask import Flask, request
import psycopg2
from datetime import datetime

app = Flask(__name__)

@app.route('/webhook/x', methods=['POST'])
def handle_x_webhook():
    """IFTTTからのX投稿データを受け取る"""
    data = request.json

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO raw_tweets (account_id, content, created_at, processed)
        VALUES (%s, %s, %s, FALSE)
    """, (data.get('username'), data.get('text'), datetime.now()))

    conn.commit()
    cur.close()
    conn.close()

    return {"status": "ok"}, 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

2. **IFTTT設定手順**
   - IFTTTアカウント作成（ifttt.com）
   - 新規Applet作成
   - トリガー: 「Twitter → New tweet by a specific user」
   - アクション: 「Webhooks → Make a web request」
   - URL: `https://your-server.com/webhook/x`
   - Method: POST

**タスク**:
- [ ] Flask/FastAPI実装
- [ ] ngrokでローカルテスト
- [ ] クラウド（Render、Heroku等）へデプロイ
- [ ] IFTTTでテスト実行

**出力ファイル**:
- `src/ingestion/webhook_server.py`
- `src/ingestion/x_monitor.py`

---

### 2-2. ニュース/RSSフィード取得
**目標**: 株関連ニュースを自動巡回し、`raw_news` に保存

**実装内容**:
- feedparser ライブラリで複数RSSフィード監視
- Googleニュースサイトのスクレイピング（または公式API）
- 定期実行（cron / APScheduler使用）

**ファイル**: `src/ingestion/news_feed.py`

```python
import feedparser
import schedule
import time
from src.storage.db_manager import DatabaseManager

NEWS_SOURCES = [
    'https://news.google.com/rss/search?q=日本株&hl=ja&gl=JP&ceid=JP:ja',
    'https://news.yahoo.co.jp/rss/topics/business.xml',
    # その他のRSSフィード
]

def fetch_news():
    db = DatabaseManager()

    for source_url in NEWS_SOURCES:
        feed = feedparser.parse(source_url)

        for entry in feed.entries:
            db.insert_raw_news(
                title=entry.title,
                url=entry.link,
                content=entry.summary,
                source=source_url
            )

# 定期実行：30分ごとに実行
schedule.every(30).minutes.do(fetch_news)

while True:
    schedule.run_pending()
    time.sleep(60)
```

**タスク**:
- [ ] RSSフィード候補調査・選定
- [ ] feedparser実装
- [ ] スケジューラ実装（APScheduler）
- [ ] エラーハンドリング
- [ ] 重複排除ロジック

**出力ファイル**:
- `src/ingestion/news_feed.py`
- `config/news_sources.yaml`（RSSフィードリスト）

---

### 2-3. Reddit投稿監視
**目標**: r/stocks等の特定サブレディットから投稿を取得

**実装内容**:
- PRAW（Python Reddit API Wrapper）で監視
- 特定キーワード（銘柄コード）で絞り込み
- `raw_reddit` に保存

**ファイル**: `src/ingestion/reddit_monitor.py`

```python
import praw
from src.storage.db_manager import DatabaseManager

# Reddit API認証（https://www.reddit.com/prefs/apps）
reddit = praw.Reddit(
    client_id='YOUR_CLIENT_ID',
    client_secret='YOUR_SECRET',
    user_agent='AutoTradingBot/1.0'
)

def monitor_reddit_subreddits():
    db = DatabaseManager()
    subreddits = ['stocks', 'investing', 'SecurityAnalysis']

    for subreddit_name in subreddits:
        subreddit = reddit.subreddit(subreddit_name)

        for submission in subreddit.new(limit=100):
            db.insert_raw_reddit(
                title=submission.title,
                content=submission.selftext,
                author=str(submission.author),
                subreddit=subreddit_name,
                url=submission.url
            )

# 定期実行
if __name__ == '__main__':
    monitor_reddit_subreddits()
```

**タスク**:
- [ ] Reddit APIクレデンシャル取得
- [ ] PRAW実装
- [ ] サブレディット候補選定
- [ ] スケジューラ統合

**出力ファイル**:
- `src/ingestion/reddit_monitor.py`

---

### 2-4. 適時開示（TDnet）データ取得
**目標**: 企業公式の適時開示をリアルタイム取得

**タスク**:
- [ ] TDnet API仕様調査
- [ ] スクレイピング実装またはAPIラッパー
- [ ] 銘柄コード抽出ロジック
- [ ] `raw_tdnet` テーブル作成・データ保存

**出力ファイル**:
- `src/ingestion/tdnet_monitor.py`

---

## Phase 3: AI分析エンジン（Week 5-7）

### 3-1. 複数LLM並列呼び出しスクリプト
**目標**: Gemini、GPT、Claude の3つのモデルに同時にリクエストを投げ、結果を統合

**実装内容**:
- asyncio を使用した非同期並列処理
- API呼び出しのエラーハンドリング
- レート制限対応
- キャッシング（同じクエリの再呼び出し回避）

**ファイル**: `src/analysis/llm_orchestrator.py`

```python
import asyncio
import openai
import anthropic
import google.generativeai as genai

class LLMOrchestrator:
    def __init__(self, openai_key, anthropic_key, gemini_key):
        openai.api_key = openai_key
        self.anthropic_client = anthropic.Anthropic(api_key=anthropic_key)
        genai.configure(api_key=gemini_key)

    async def call_gpt4o(self, prompt):
        """GPT-4o呼び出し"""
        response = await openai.ChatCompletion.acreate(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7
        )
        return response['choices'][0]['message']['content']

    async def call_claude(self, prompt):
        """Claude 3.5 Sonnet呼び出し"""
        response = self.anthropic_client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.content[0].text

    async def call_gemini(self, prompt):
        """Gemini 1.5 Pro呼び出し"""
        model = genai.GenerativeModel('gemini-1.5-pro')
        response = model.generate_content(prompt)
        return response.text

    async def analyze_parallel(self, text, prompt_template):
        """3つのモデルに並列で送信"""
        prompt = prompt_template.format(text=text)

        results = await asyncio.gather(
            self.call_gpt4o(prompt),
            self.call_claude(prompt),
            self.call_gemini(prompt)
        )

        return {
            'gpt4o': results[0],
            'claude': results[1],
            'gemini': results[2]
        }
```

**タスク**:
- [ ] OpenAI API統合
- [ ] Anthropic API統合
- [ ] Google Gemini API統合
- [ ] asyncio による並列処理
- [ ] レート制限ハンドリング
- [ ] リトライロジック

**出力ファイル**:
- `src/analysis/llm_orchestrator.py`

---

### 3-2. プロンプト定義・テンプレート化
**目標**: 各LLMに投げるプロンプトを統一・最適化

**実装内容**:
各段階のプロンプトを定義

**ファイル**: `src/analysis/prompts.py`

```python
EXTRACTION_PROMPT = """
以下の投稿テキストを解析し、JSON形式で以下を抽出せよ:

{{
  "tickers": ["銘柄コード1", "銘柄コード2"],
  "sentiment": "POSITIVE|NEGATIVE|NEUTRAL",
  "key_points": ["重要な点1", "重要な点2"],
  "keywords": ["キーワード1", "キーワード2"]
}}

テキスト:
{text}
"""

VERIFICATION_PROMPT = """
以下のテキストの信頼性を100点満点で評価し、以下のJSON形式で返せ:

{{
  "veracity_score": 85,
  "reasoning": "評価の理由を簡潔に",
  "risks": ["リスク1", "リスク2"],
  "confidence": 0.85
}}

テキスト:
{text}

過去のメモリ:
{memory_context}
"""

CONSENSUS_PROMPT = """
以下の3つのLLMの分析結果を見て、総合的な判定を下せ:

GPT-4o: {gpt_result}
Claude: {claude_result}
Gemini: {gemini_result}

最終的な投資判断（BUY/HOLD/SELL/IGNORE）:
その根拠:
"""
```

**タスク**:
- [ ] 各ステップのプロンプト設計
- [ ] プロンプト最適化（試行錯誤）
- [ ] テンプレート化・パラメータ化
- [ ] JSONスキーマの定義

**出力ファイル**:
- `src/analysis/prompts.py`

---

### 3-3. 合議制スコアリング・ロジック
**目標**: 複数LLMの結果を統計的に処理し、最終判定を決定

**実装内容**:

**ファイル**: `src/analysis/consensus_logic.py`

```python
import numpy as np
import json
from src.storage.db_manager import DatabaseManager

class ConsensusEngine:
    def __init__(self):
        self.db = DatabaseManager()

    def aggregate_scores(self, llm_results):
        """
        複数LLMのスコアを統合

        Args:
            llm_results: {
                'gpt4o': {'veracity_score': 85, 'reasoning': '...'},
                'claude': {'veracity_score': 78, 'reasoning': '...'},
                'gemini': {'veracity_score': 92, 'reasoning': '...'}
            }

        Returns:
            {
                'consensus_score': 85.0,
                'std_dev': 5.5,
                'agreement_level': 'HIGH',
                'final_decision': 'EXECUTE'
            }
        """
        scores = [v['veracity_score'] for v in llm_results.values()]

        # 統計計算
        consensus = np.mean(scores)
        std_dev = np.std(scores)

        # 同意度レベル判定
        if std_dev < 5:
            agreement = 'HIGH'
        elif std_dev < 15:
            agreement = 'MEDIUM'
        else:
            agreement = 'LOW'

        # 最終決定ロジック
        if consensus > 80 and agreement in ['HIGH', 'MEDIUM']:
            decision = 'EXECUTE'
        elif consensus > 60:
            decision = 'WATCH'
        elif consensus > 40:
            decision = 'HOLD'
        else:
            decision = 'REJECT'

        return {
            'consensus_score': float(consensus),
            'std_dev': float(std_dev),
            'agreement_level': agreement,
            'final_decision': decision,
            'individual_scores': scores
        }

    def compute_weighted_score(self, llm_results, weights=None):
        """
        各LLMの過去の的中率を考慮した加重平均

        weights: {'gpt4o': 0.3, 'claude': 0.4, 'gemini': 0.3}
        """
        if weights is None:
            weights = {
                'gpt4o': 0.33,
                'claude': 0.33,
                'gemini': 0.34
            }

        weighted_sum = 0
        for model_name, weight in weights.items():
            score = llm_results[model_name]['veracity_score']
            weighted_sum += score * weight

        return weighted_sum
```

**タスク**:
- [ ] 統計的集約アルゴリズム実装
- [ ] 加重平均計算（履歴ベース）
- [ ] 最終判定ロジック実装
- [ ] 決定の可視化
- [ ] テスト・調整

**出力ファイル**:
- `src/analysis/consensus_logic.py`

---

### 3-4. DB保存ロジック
**目標**: 分析結果を `analysis_scores` と `final_consensus` に自動保存

**タスク**:
- [ ] `analysis_scores` テーブルへのINSERT
- [ ] `final_consensus` テーブルへのINSERT
- [ ] トランザクション処理
- [ ] エラーハンドリング

---

## Phase 4: メモリ化・RAG実装（Week 8-9）

### 4-1. pgvector導入・セットアップ
**目標**: PostgreSQLで高次元ベクトル検索を実現

**タスク**:
- [ ] pgvector拡張機能をPostgreSQLに導入
- [ ] `intelligence_memory` テーブルに `embedding` 列追加（VECTOR型）
- [ ] インデックス作成（IVFFlat/HNSW）

```sql
-- pgvector拡張の有効化
CREATE EXTENSION IF NOT EXISTS vector;

-- intelligence_memoryテーブル更新
ALTER TABLE intelligence_memory
ADD COLUMN embedding vector(1536);  -- OpenAI embeddingの次元数

-- インデックス作成（高速検索）
CREATE INDEX ON intelligence_memory USING ivfflat (embedding vector_cosine_ops);
```

---

### 4-2. Embedding生成パイプライン
**目標**: すべての収集データをベクトル化し、pgvectorに保存

**ファイル**: `src/analysis/embedding_generator.py`

```python
import openai
from src.storage.db_manager import DatabaseManager

class EmbeddingGenerator:
    def __init__(self, openai_key):
        openai.api_key = openai_key

    def generate_embedding(self, text):
        """テキストをベクトル化"""
        response = openai.Embedding.create(
            input=text,
            model="text-embedding-3-small"
        )
        return response['data'][0]['embedding']

    def embed_unprocessed_data(self):
        """未処理のデータをベクトル化してDBに保存"""
        db = DatabaseManager()

        # embedding が NULL のレコードを取得
        unembedded = db.get_unembedded_records()

        for record in unembedded:
            embedding = self.generate_embedding(record['content'])
            db.update_embedding(record['id'], embedding)
```

**タスク**:
- [ ] OpenAI Embedding API統合
- [ ] バッチ処理実装（効率化）
- [ ] キャッシング
- [ ] 定期実行スケジューラ

---

### 4-3. 相関分析・メモリ検索
**目標**: 新しい情報が来たとき、過去の関連情報を自動検索

**ファイル**: `src/analysis/memory_search.py`

```python
import numpy as np
from src.storage.db_manager import DatabaseManager

class MemorySearchEngine:
    def __init__(self):
        self.db = DatabaseManager()

    def search_similar(self, query_embedding, ticker_code=None, limit=5):
        """
        ベクトル類似度検索で関連情報を取得

        Args:
            query_embedding: 新規データのembedding
            ticker_code: 特定銘柄に絞り込む（オプション）
            limit: 取得件数

        Returns:
            [
                {'id': 1, 'content': '...', 'similarity': 0.92, 'created_at': '...'},
                ...
            ]
        """
        return self.db.vector_search_similar(
            embedding=query_embedding,
            ticker_code=ticker_code,
            limit=limit
        )

    def get_context_for_ticker(self, ticker_code, days=30):
        """特定銘柄の過去30日の情報を取得（LLMへのコンテキスト）"""
        return self.db.get_ticker_memory(ticker_code, days=days)
```

**タスク**:
- [ ] SQLでの余弦類似度検索実装
- [ ] 銘柄ごとのメモリ取得ロジック
- [ ] LLMへの文脈情報としての統合

---

## Phase 5: 最適化・自動売買（Week 10-12）

### 5-1. ポートフォリオ最適化エンジン
**目標**: 現在の資産状況とAI判定を踏まえ、最適な買付量を計算

**ファイル**: `src/optimization/portfolio_optimizer.py`

```python
import numpy as np
from scipy.optimize import minimize

class PortfolioOptimizer:
    def __init__(self, db_manager):
        self.db = db_manager

    def kelly_criterion(self, win_rate, avg_win, avg_loss):
        """
        ケリー基準による最適投資額計算

        f* = (p * b - q) / b
        f*: 最適投資比率
        p: 勝率
        b: win/loss比
        q: 敗率
        """
        p = win_rate
        q = 1 - p
        b = avg_win / avg_loss if avg_loss > 0 else 1

        kelly = (p * b - q) / b if b > 0 else 0
        return max(0, min(kelly, 0.25))  # 25%上限

    def optimize_allocation(self, signals, total_capital, risk_limit):
        """
        複数のシグナルに対し、資本配分を最適化

        Args:
            signals: [
                {'ticker': '7203', 'confidence': 0.85, 'expected_return': 0.05},
                ...
            ]
            total_capital: 総資本
            risk_limit: 許容損失額

        Returns:
            allocation: {'7203': 50000, '9984': 30000, ...}
        """
        allocations = {}
        remaining_capital = total_capital

        # 信頼度でソート
        sorted_signals = sorted(signals, key=lambda x: x['confidence'], reverse=True)

        for signal in sorted_signals:
            ticker = signal['ticker']
            confidence = signal['confidence']

            # 信頼度に基づく配分（高いほど多く）
            allocation = int(remaining_capital * (confidence / 1.0 * 0.3))

            # リスク上限チェック
            potential_loss = allocation * 0.05  # 仮想的な5%下落
            if potential_loss <= risk_limit:
                allocations[ticker] = allocation
                remaining_capital -= allocation

        return allocations
```

**タスク**:
- [ ] ケリー基準実装
- [ ] ポートフォリオ配分アルゴリズム
- [ ] リスク制限の強制
- [ ] 過去の成績に基づく重み付け

---

### 5-2. リスク管理エンジン
**目標**: 損失上限、ポジションサイズ制限など自動管理

**ファイル**: `src/optimization/risk_manager.py`

```python
class RiskManager:
    def __init__(self, total_assets, max_loss_per_trade=0.01, max_loss_daily=0.05):
        """
        Args:
            total_assets: 総資産
            max_loss_per_trade: 1回の取引での最大損失率（デフォルト1%）
            max_loss_daily: 1日での最大損失率（デフォルト5%）
        """
        self.total_assets = total_assets
        self.max_loss_per_trade = max_loss_per_trade
        self.max_loss_daily = max_loss_daily

    def can_execute_trade(self, signal, current_position_size, current_loss):
        """トレード実行可能か判定"""

        # 1回あたりの最大損失
        max_loss = self.total_assets * self.max_loss_per_trade

        # 1日あたりの最大損失
        max_daily_loss = self.total_assets * self.max_loss_daily

        if current_loss >= max_daily_loss:
            return False, "Daily loss limit reached"

        if signal['expected_loss'] > max_loss:
            return False, "Trade loss exceeds limit"

        return True, "OK"
```

**タスク**:
- [ ] 損失上限チェックロジック
- [ ] ポジションサイズ計算
- [ ] ストップロス自動実装
- [ ] リバランスロジック

---

### 5-3. 証券会社API連携
**目標**: 売買シグナルを実際の注文に変換・実行

**ファイル**: `src/execution/trading_engine.py`

```python
from src.optimization.risk_manager import RiskManager

class TradingEngine:
    def __init__(self, broker_api, risk_manager):
        self.broker = broker_api
        self.risk = risk_manager

    def execute_signal(self, signal, allocation):
        """
        AI判定に基づき実際に注文を出す

        Args:
            signal: {'ticker': '7203', 'action': 'BUY', 'confidence': 0.85}
            allocation: 割当金額
        """

        # リスク判定
        can_trade, reason = self.risk.can_execute_trade(signal, allocation, 0)
        if not can_trade:
            print(f"Trade rejected: {reason}")
            return None

        # 注文量計算
        current_price = self.broker.get_current_price(signal['ticker'])
        quantity = int(allocation / current_price)

        # 注文送信
        if signal['action'] == 'BUY':
            order = self.broker.send_buy_order(
                ticker=signal['ticker'],
                quantity=quantity,
                price=current_price,
                order_type='MARKET'
            )
        else:
            order = self.broker.send_sell_order(...)

        # DBに記録
        self.db.record_trade(order)

        return order
```

**タスク**:
- [ ] auカブコム証券kabuステーションAPI実装
- [ ] Interactive Brokers連携（米株用）
- [ ] 注文の成行・指値対応
- [ ] 約定確認・DB記録

---

### 5-4. モニタリング・ダッシュボード
**目標**: リアルタイムで収益率、ドローダウン等を監視

**タスク**:
- [ ] Webダッシュボード構築（Streamlit / Dash）
- [ ] リアルタイム収益グラフ
- [ ] 取引履歴表示
- [ ] アラート機能

---

## 実装時の優先度・並列化

```
Week 1-2
  ├─ PostgreSQL環境構築
  ├─ stocks_master作成
  └─ テーブル全定義

Week 3-4
  ├─ Webhook実装（並列）
  ├─ ニュースフィード取得
  ├─ Reddit監視
  └─ TDnet取得

Week 5-7
  ├─ LLM並列呼び出し（並列）
  ├─ プロンプト最適化
  └─ 合議制ロジック

Week 8-9
  ├─ pgvector導入（並列）
  ├─ Embedding生成
  └─ メモリ検索実装

Week 10-12
  ├─ ポートフォリオ最適化（並列）
  ├─ リスク管理
  ├─ 証券API連携
  └─ ダッシュボード
```

---

## チェックリスト

- [ ] すべてのファイルがGitHubリポジトリにコミット
- [ ] requirements.txt が最新
- [ ] Docker/docker-compose対応
- [ ] CI/CD パイプライン構築（GitHub Actions）
- [ ] ロギング・アラート体制
- [ ] バックアップ戦略
- [ ] 本番環境への段階的移行計画
