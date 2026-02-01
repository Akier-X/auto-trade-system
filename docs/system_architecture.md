# Project Alpha: システムアーキテクチャ詳細設計

## 全体アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA COLLECTION LAYER                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   X API     │  │  News RSS    │  │   Reddit    │  │   TDnet API     │  │
│  │  (IFTTT)    │  │  (Python)    │  │  (PRAW)     │  │  (Scraper)      │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └────────┬────────┘  │
│         │                │                 │                  │            │
│         └────────────────┼─────────────────┼──────────────────┘            │
│                          ▼                                                  │
│              ┌──────────────────────────┐                                  │
│              │   Webhook Server         │                                  │
│              │   (Flask/FastAPI)        │                                  │
│              └──────────────┬───────────┘                                  │
│                             │                                              │
│              ┌──────────────▼───────────┐                                  │
│              │   PostgreSQL (raw_*)     │                                  │
│              │   - raw_tweets           │                                  │
│              │   - raw_news             │                                  │
│              │   - raw_reddit           │                                  │
│              │   - raw_tdnet            │                                  │
│              └──────────────┬───────────┘                                  │
│                             │                                              │
└─────────────────────────────┼──────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼──────────────────────────────────────────────┐
│                    PROCESSING & ENRICHMENT LAYER                            │
├─────────────────────────────┼──────────────────────────────────────────────┤
│                             ▼                                              │
│              ┌──────────────────────────┐                                  │
│              │  Embedding Generator     │                                  │
│              │  (OpenAI embeddings)     │                                  │
│              └──────────────┬───────────┘                                  │
│                             │                                              │
│                ┌────────────▼────────────┐                                │
│                │ PostgreSQL::vector      │                                │
│                │ (intelligence_memory)   │                                │
│                │ + embedding             │                                │
│                └────────┬────────────────┘                                │
│                         │                                                  │
└─────────────────────────┼──────────────────────────────────────────────────┘
                          │
┌─────────────────────────┼──────────────────────────────────────────────────┐
│                    ANALYSIS LAYER (複数LLM)                                 │
├─────────────────────────┼──────────────────────────────────────────────────┤
│                         │                                                  │
│    ┌────────────────────┼────────────────────┐                            │
│    │                    │                    │                            │
│    ▼                    ▼                    ▼                            │
│ ┌──────────┐         ┌──────────┐        ┌──────────┐                    │
│ │  GPT-4o  │         │ Claude   │        │ Gemini   │                    │
│ │ (async)  │         │ (async)  │        │ (async)  │                    │
│ └────┬─────┘         └────┬─────┘        └────┬─────┘                    │
│      │                    │                   │                          │
│      └────────┬───────────┼───────────────────┘                          │
│               ▼                                                           │
│     ┌─────────────────────┐                                              │
│     │  Consensus Engine   │                                              │
│     │  (aggregate scores) │                                              │
│     └────────┬────────────┘                                              │
│              │                                                           │
│     ┌────────▼─────────────┐                                            │
│     │ PostgreSQL           │                                            │
│     │ - analysis_scores    │                                            │
│     │ - final_consensus    │                                            │
│     └────────┬─────────────┘                                            │
│              │                                                           │
└──────────────┼───────────────────────────────────────────────────────────┘
               │
┌──────────────┼───────────────────────────────────────────────────────────┐
│          OPTIMIZATION & EXECUTION LAYER                                  │
├──────────────┼───────────────────────────────────────────────────────────┤
│              ▼                                                            │
│     ┌─────────────────────┐                                              │
│     │ Portfolio Optimizer │                                              │
│     │ (Kelly Criterion)   │                                              │
│     └────────┬────────────┘                                              │
│              │                                                           │
│     ┌────────▼─────────────┐                                            │
│     │ Risk Manager         │                                            │
│     │ (Stop Loss, etc)     │                                            │
│     └────────┬─────────────┘                                            │
│              │                                                           │
│     ┌────────▼──────────────┐                                           │
│     │ Trading Engine        │                                           │
│     │ (Order Execution)     │                                           │
│     └────────┬──────────────┘                                           │
│              │                                                           │
│     ┌────────▼──────────────┐                                           │
│     │ Broker API           │                                            │
│     │ (kabustation, IB)     │                                           │
│     └────────┬──────────────┘                                           │
│              │                                                           │
│     ┌────────▼──────────────────┐                                       │
│     │ PostgreSQL: trade_history │                                       │
│     │            portfolio_mgmt  │                                       │
│     └──────────────────────────┘                                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## コンポーネント詳細設計

### 1. Data Collection Layer

#### 1-1. IFTTT + Webhook Server

**責務**: X（Twitter）から自動的に投稿を取得し、Pythonサーバーで受け取る

```
User Setup IFTTT:
┌─────────────────────┐
│ IFTTT Applet        │
├─────────────────────┤
│ IF: New tweet by    │
│     specific user   │
│ THEN: POST to       │
│ https://myserver/   │
│ webhook/x           │
└────────┬────────────┘
         │
         │ (HTTP POST)
         │
         ▼
┌─────────────────────────┐
│ Python Webhook Server   │
│ (Flask/FastAPI)         │
│ /webhook/x              │
│ → Receive JSON          │
│ → raw_tweets INSERT     │
└────────┬────────────────┘
         │
         ▼
    PostgreSQL
```

**実装**: `src/ingestion/webhook_server.py`

```python
from flask import Flask, request
from src.storage.db_manager import DatabaseManager

app = Flask(__name__)
db = DatabaseManager()

@app.route('/webhook/x', methods=['POST'])
def handle_x_webhook():
    data = request.json
    # X投稿データをraw_tweetsに保存
    db.insert_raw_tweet(
        account_id=data['username'],
        content=data['text'],
        published_at=data['createdISO']
    )
    return {"status": "ok"}, 200

@app.route('/webhook/news', methods=['POST'])
def handle_news_webhook():
    # ニュース記事をraw_newsに保存
    data = request.json
    db.insert_raw_news(
        title=data['title'],
        content=data['content'],
        source_url=data['url']
    )
    return {"status": "ok"}, 200

@app.route('/health', methods=['GET'])
def health():
    return {"status": "alive"}, 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
```

---

#### 1-2. News Feed Fetcher

**責備**: RSSフィード、Googleニュースから定期的にニュースを取得

**実装**: `src/ingestion/news_feed.py`

```python
import feedparser
import schedule
from src.storage.db_manager import DatabaseManager

class NewsFeedFetcher:
    def __init__(self):
        self.db = DatabaseManager()
        self.sources = [
            {
                'name': 'Yahoo Finance',
                'url': 'https://news.yahoo.com/rss'
            },
            {
                'name': 'Google News Japan',
                'url': 'https://news.google.com/rss/search?q=日本株'
            }
        ]

    def fetch_all_sources(self):
        """すべてのRSSフィードを取得"""
        for source in self.sources:
            self._fetch_single_source(source)

    def _fetch_single_source(self, source):
        """単一のRSSフィードを取得"""
        feed = feedparser.parse(source['url'])
        for entry in feed.entries:
            self.db.insert_raw_news(
                source_name=source['name'],
                title=entry.title,
                content=entry.summary,
                article_url=entry.link,
                published_at=entry.published_parsed
            )

# スケジューラ設定
def schedule_news_fetching():
    fetcher = NewsFeedFetcher()
    schedule.every(30).minutes.do(fetcher.fetch_all_sources)

    while True:
        schedule.run_pending()
        time.sleep(60)
```

---

#### 1-3. Reddit Monitor

**責務**: Reddit（r/stocks等）から投稿を取得

**実装**: `src/ingestion/reddit_monitor.py`

```python
import praw
from src.storage.db_manager import DatabaseManager

class RedditMonitor:
    def __init__(self, client_id, client_secret):
        self.reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent='AutoTradingBot/1.0'
        )
        self.db = DatabaseManager()
        self.target_subreddits = ['stocks', 'investing', 'SecurityAnalysis']

    def monitor(self):
        """定期的に監視"""
        for subreddit_name in self.target_subreddits:
            subreddit = self.reddit.subreddit(subreddit_name)
            for submission in subreddit.new(limit=100):
                self.db.insert_raw_reddit(
                    subreddit=subreddit_name,
                    title=submission.title,
                    content=submission.selftext,
                    author=str(submission.author),
                    upvotes=submission.score,
                    comments_count=submission.num_comments
                )
```

---

### 2. Processing & Enrichment Layer

#### 2-1. Embedding Generator

**責務**: テキストをOpenAI embeddingでベクトル化し、pgvectorに保存

**実装**: `src/analysis/embedding_generator.py`

```python
import openai
from src.storage.db_manager import DatabaseManager

class EmbeddingGenerator:
    def __init__(self, openai_key):
        openai.api_key = openai_key
        self.db = DatabaseManager()

    def generate_embedding(self, text):
        """テキストをベクトル化"""
        response = openai.Embedding.create(
            input=text,
            model="text-embedding-3-small"
        )
        return response['data'][0]['embedding']

    def process_intelligence_memory(self):
        """未処理のintelligence_memoryレコードをベクトル化"""
        records = self.db.get_unembedded_intelligence()

        for record in records:
            embedding = self.generate_embedding(record['original_text'])
            self.db.update_intelligence_embedding(record['id'], embedding)
            print(f"Embedded intelligence_id={record['id']}")
```

---

### 3. Analysis Layer (複数LLM合議制)

#### 3-1. LLM Orchestrator

**責務**: 複数のLLMに同時にリクエストを投げ、結果を取得

**実装**: `src/analysis/llm_orchestrator.py`

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
        """GPT-4o呼び出し（非同期）"""
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: openai.ChatCompletion.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7
            )
        )
        return response['choices'][0]['message']['content']

    async def call_claude(self, prompt):
        """Claude 3.5 Sonnet呼び出し（非同期）"""
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.anthropic_client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}]
            )
        )
        return response.content[0].text

    async def call_gemini(self, prompt):
        """Gemini呼び出し（非同期）"""
        loop = asyncio.get_event_loop()
        model = genai.GenerativeModel('gemini-1.5-pro')
        response = await loop.run_in_executor(
            None,
            lambda: model.generate_content(prompt)
        )
        return response.text

    async def analyze_parallel(self, text, prompt_template):
        """3つのモデルに並列で分析させる"""
        prompt = prompt_template.format(text=text)

        results = await asyncio.gather(
            self.call_gpt4o(prompt),
            self.call_claude(prompt),
            self.call_gemini(prompt),
            return_exceptions=True
        )

        return {
            'gpt4o': results[0] if not isinstance(results[0], Exception) else str(results[0]),
            'claude': results[1] if not isinstance(results[1], Exception) else str(results[1]),
            'gemini': results[2] if not isinstance(results[2], Exception) else str(results[2])
        }

    def run_analysis(self, text, prompt_template):
        """非同期処理を実行（同期ラッパー）"""
        return asyncio.run(self.analyze_parallel(text, prompt_template))
```

---

#### 3-2. Consensus Engine

**責務**: 複数LLMのスコアを統計的に統合

**実装**: `src/analysis/consensus_logic.py`

```python
import numpy as np
import json

class ConsensusEngine:
    def aggregate_scores(self, llm_results):
        """
        複数LLMのスコアを統合

        llm_results: {
            'gpt4o': {'veracity_score': 85, 'sentiment': 'POSITIVE'},
            'claude': {'veracity_score': 78, 'sentiment': 'POSITIVE'},
            'gemini': {'veracity_score': 92, 'sentiment': 'POSITIVE'}
        }
        """

        # スコア抽出
        scores = []
        for model, result in llm_results.items():
            try:
                score = result['veracity_score']
                scores.append(score)
            except (KeyError, TypeError):
                continue

        if not scores:
            return None

        # 統計計算
        consensus = np.mean(scores)
        std_dev = np.std(scores)

        # 同意度判定
        if std_dev < 5:
            agreement = 'HIGH'
        elif std_dev < 15:
            agreement = 'MEDIUM'
        else:
            agreement = 'LOW'

        # 最終決定
        if consensus > 80 and agreement in ['HIGH', 'MEDIUM']:
            decision = 'STRONG_BUY'
        elif consensus > 65:
            decision = 'BUY'
        elif consensus > 50:
            decision = 'HOLD'
        elif consensus > 35:
            decision = 'WATCH'
        else:
            decision = 'REJECT'

        return {
            'aggregated_score': float(consensus),
            'standard_deviation': float(std_dev),
            'agreement_level': agreement,
            'final_decision': decision,
            'individual_scores': scores
        }
```

---

### 4. Optimization & Execution Layer

#### 4-1. Portfolio Optimizer

**責備**: 複数のシグナルに対し、資本配分を最適化

**実装**: `src/optimization/portfolio_optimizer.py`

```python
class PortfolioOptimizer:
    def kelly_criterion(self, win_rate, avg_win, avg_loss):
        """Kelly Criterion: f* = (p*b - q) / b"""
        p = win_rate
        q = 1 - p
        b = avg_win / avg_loss if avg_loss > 0 else 1

        kelly = (p * b - q) / b if b > 0 else 0
        # 25%上限
        return max(0, min(kelly, 0.25))

    def optimize_allocation(self, signals, total_capital, risk_limit):
        """
        複数シグナルに対する最適配分

        signals: [
            {
                'ticker': '7203',
                'confidence': 0.85,
                'expected_return': 0.05,
                'expected_loss': 0.02
            }
        ]
        """
        allocations = {}
        remaining_capital = total_capital

        # 信頼度順でソート
        sorted_signals = sorted(
            signals,
            key=lambda x: x.get('confidence', 0),
            reverse=True
        )

        for signal in sorted_signals:
            ticker = signal['ticker']
            confidence = signal.get('confidence', 0.5)

            # 信頼度に基づく配分
            allocation = int(remaining_capital * (confidence * 0.3))

            # リスク確認
            potential_loss = allocation * signal.get('expected_loss', 0.05)
            if potential_loss <= risk_limit and allocation > 0:
                allocations[ticker] = allocation
                remaining_capital -= allocation

        return allocations
```

---

#### 4-2. Trading Engine

**責备**: 売買シグナルを実際の注文に変換し実行

**実装**: `src/execution/trading_engine.py`

```python
class TradingEngine:
    def __init__(self, broker_api, risk_manager, db_manager):
        self.broker = broker_api
        self.risk = risk_manager
        self.db = db_manager

    def execute_signal(self, signal, allocation):
        """
        AI判定に基づき注文を実行

        signal: {
            'ticker': '7203',
            'action': 'BUY',
            'confidence': 0.85,
            'consensus_id': 123
        }
        """

        # リスク判定
        can_trade, reason = self.risk.can_execute_trade(signal)
        if not can_trade:
            print(f"Trade rejected: {reason}")
            return None

        # 注文量計算
        current_price = self.broker.get_current_price(signal['ticker'])
        quantity = int(allocation / current_price)

        if quantity <= 0:
            return None

        # 注文送信
        try:
            if signal['action'] == 'BUY':
                order = self.broker.send_buy_order(
                    ticker=signal['ticker'],
                    quantity=quantity,
                    order_type='MARKET'
                )
            else:
                order = self.broker.send_sell_order(
                    ticker=signal['ticker'],
                    quantity=quantity,
                    order_type='MARKET'
                )

            # DB記録
            self.db.record_trade(
                ticker=signal['ticker'],
                order_type=signal['action'],
                quantity=quantity,
                price=current_price,
                consensus_id=signal['consensus_id']
            )

            return order

        except Exception as e:
            print(f"Order execution failed: {e}")
            return None
```

---

## データフロー例

### ケース: Xで新しい投稿が来た場合

```
1. IFTTT が投稿を検知
   ↓
2. Webhook Server /webhook/x が HTTP POST受け取り
   ↓
3. DatabaseManager.insert_raw_tweet() で raw_tweets に保存
   ↓
4. 定期的に未処理( processed=FALSE)の raw_tweets をスキャン
   ↓
5. Embedding Generator がテキストをベクトル化
   ↓
6. intelligence_memory に統合データとして保存
   ↓
7. LLM Orchestrator が3つのLLMに並列リクエスト送信
   ↓
8. analysis_scores に各LLMのスコアを記録
   ↓
9. Consensus Engine が加重平均を計算
   ↓
10. final_consensus に最終判定を記録
   ↓
11. Trading Engine が売買ルール条件をチェック
   ↓
12. 条件を満たせば Broker API へ注文送信
   ↓
13. trade_history に約定を記録
   ↓
14. portfolio_mgmt を更新（保有額、リターン等）
```

---

## リアルタイムモニタリング戦略

### スケジューラ構成

```python
# APScheduler による定期実行管理
from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()

# 数秒ごと：未処理データをスキャン
scheduler.add_job(process_unprocessed_intelligence, 'interval', seconds=5)

# 分ごと：LLM分析を実行
scheduler.add_job(run_llm_analysis, 'interval', minutes=1)

# 分ごと：コンセンサスを更新
scheduler.add_job(update_consensus, 'interval', minutes=1)

# 数秒ごと：売買シグナルをチェック
scheduler.add_job(check_trading_signals, 'interval', seconds=10)

# 日ごと：ポートフォリオを更新
scheduler.add_job(update_portfolio, 'cron', hour=15, minute=0)

# 30分ごと：ニュースを取得
scheduler.add_job(fetch_news, 'interval', minutes=30)

scheduler.start()
```

---

## エラーハンドリング・リトライ戦略

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10)
)
def call_llm_with_retry(prompt):
    """LLM呼び出しを最大3回まで リトライ"""
    return llm_orchestrator.run_analysis(prompt)

@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=2, max=60)
)
def database_insert_with_retry(data):
    """DB操作を最大5回まで リトライ（指数バックオフ）"""
    return db.insert_raw_tweet(data)
```

---

## ロギング・監視

```python
import logging

# ロギング設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/app.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# 使用例
logger.info(f"Intelligence processed: {intelligence_id}")
logger.warning(f"LLM call failed: {model_name}")
logger.error(f"Database connection lost: {error}")
```

---

## まとめ

このシステムアーキテクチャは以下を実現：

1. **スケーラビリティ**: 非同期処理により複数ソースを同時に処理
2. **信頼性**: 複数LLMの合議制により誤判定リスクを低減
3. **速度**: ベクトル検索により過去情報を高速に参照
4. **自動化**: スケジューラにより完全な自動運用を実現
5. **監査性**: すべての決定がDBに記録され、後から検証可能
