# Project Alpha: 多ソース統合AI自動売買システム

## プロジェクト概要

**Project Alpha** は、X（Twitter）、ニュース、Redditなどの複数メディアからのシグナルを、複数のLLM（大規模言語モデル）による合議制で分析し、構造化データベース（PostgreSQL）に蓄積し、最終的にはポートフォリオ最適化を行う完全自動売買システムです。

### システムの特徴

- **マルチソース・インテリジェンス**: X、ニュース、Reddit、適時開示など複数の情報源を横断的に監視
- **複数LLM合議制**: Gemini、GPT-4、Claudeなどの異なるLLMに同じ情報を分析させ、統計的に結果を統合
- **永続的メモリ化**: すべての分析結果をPostgreSQLに蓄積し、過去データとのメモリ化・コンテキスト保持
- **リスク管理**: ポートフォリオ最適化、リバランス、損失上限の自動管理
- **無料・低コスト構成**: APIを最小限に抑え（IFTTT、無料LLM枠活用）、スケーラブルな設計

---

## システムアーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                              │
├─────────────────────────────────────────────────────────────────┤
│  X(特定アカウント)  │  ニュース/RSS  │  Reddit  │  適時開示      │
│  (IFTTT経由)        │  (Python)      │ (PRAW)   │  (TDnet)       │
└────────┬────────────────────┬─────────────────────┬──────────────┘
         │                    │                     │
         └────────────────────┼─────────────────────┘
                              ▼
                   ┌──────────────────────┐
                   │  PostgreSQL Database │
                   │  (raw_tweets層)      │
                   └──────────┬───────────┘
                              │
         ┌────────────────────┼─────────────────────┐
         │                    │                     │
         ▼                    ▼                     ▼
    ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐
    │ LLM Team A  │  │ LLM Team B  │  │  LLM Team C      │
    │ (構造化)    │  │ (検証1)     │  │  (検証2・最終)   │
    │ GPT/Claude  │  │ Gemini/     │  │  Claude/Gemini   │
    │             │  │ GPT/Claude  │  │                  │
    └─────┬───────┘  └─────┬───────┘  └────────┬─────────┘
          │                │                   │
          └────────────────┼───────────────────┘
                           │
                           ▼
                ┌───────────────────────┐
                │  PostgreSQL Database  │
                │ (分析結果・合議層)    │
                │ (structured_signals)  │
                └───────────┬───────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │ Portfolio Optimizer   │
                │ (資産最適化エンジン)  │
                └───────────┬───────────┘
                            │
                            ▼
            ┌───────────────────────────────┐
            │  Trading Execution Engine     │
            │  (証券会社API連携)            │
            └───────────────────────────────┘
```

---

## 主要コンポーネント

### 1. **Data Ingestion Layer（データ取得層）**
- **X Integration**: IFTTT/Makeを使用した信頼できるアカウント監視
- **News Feed**: RSSフィード、GoogleニュースAPI等での業界ニュース取得
- **Reddit Monitor**: r/stocks等の特定サブレディットの監視（PRAW）
- **Official Disclosure**: TDnet、JPX公式サイトから適時開示の取得

### 2. **PostgreSQL Database Layer（データベース層）**
以下のテーブルで構成：
- `stocks_master`: 全銘柄マスター
- `intelligence_memory`: マルチソース情報の統合メモリ
- `monitored_tickers`: 監視対象銘柄の動的管理
- `analysis_scores`: 各LLMの個別スコアリング結果
- `final_consensus`: 複数LLMの合議結果
- `portfolio_mgmt`: 資産・ポートフォリオ情報
- `trade_history`: 取引履歴

詳細は → [Database Design](docs/database_design.md)

### 3. **Multi-LLM Analysis Layer（複数LLM分析層）**

**第1層：データ構造化チーム**
- GPT-4o（構造化抽出の安定性）
- Claude 3.5 Haiku（高速処理）
→ 銘柄コード、キーワード、数値の抽出・統合

**第2層：多角的検証チーム**
- Gemini 1.5 Pro（長文コンテキスト）
- Claude 3.5 Sonnet（論理推論）
- GPT-4 Turbo（一般的推論）
→ 真偽度スコア（0-100）、リスク検知

**第3層：メタ判定（統合・最終決定）**
- 加重平均またはアンサンブル学習で最終スコアを算出
- 複数モデルの標準偏差から「判断の信頼度」を定量化

### 4. **Portfolio Optimizer（資産最適化エンジン）**
- ケリー基準による最適買付量の算出
- リスク許容度に基づくサイズ調整
- 複数戦略（短期/長期）の並列運用と自動リバランス

### 5. **Trading Execution Engine（売買実行エンジン）**
- auカブコム証券kabuステーションAPI、Interactive Brokers等との連携
- セーフティネット：1回の取引額上限、損失上限の固定値設定
- 約定確認とDB更新の自動化

---

## 実装ロードマップ

詳細は → [ROADMAP.md](ROADMAP.md)

### フェーズ1：基盤構築（Week 1-2）
- PostgreSQL環境構築（ローカルまたはSupabase）
- stocks_master テーブル作成・データインポート
- 基本的なDDL（テーブル定義）完成

### フェーズ2：データ取得パイプライン（Week 3-4）
- IFTTT/Make設定（Xアカウント監視）
- Python Webhookサーバー実装（Flask/FastAPI）
- ニュースRSSフィード取得スクリプト実装

### フェーズ3：AI分析エンジン（Week 5-7）
- 複数LLM並列呼び出しスクリプト実装
- 合議制ロジック実装（スコア統合アルゴリズム）
- PostgreSQL への書き込みロジック完成

### フェーズ4：メモリ化・RAG（Week 8-9）
- pgvector導入・Embedding生成パイプライン
- 過去データとの相関分析ロジック
- コンテキスト検索実装

### フェーズ5：最適化・自動売買（Week 10-12）
- ポートフォリオ最適化エンジン実装
- 証券会社API連携（テスト段階）
- 完全自動化とモニタリング体制構築

---

## ファイル・フォルダ構成

```
auto-trade-system/
├── README.md                      # このファイル
├── ROADMAP.md                     # 詳細なロードマップ
├── docs/
│   ├── database_design.md         # DB設計書
│   ├── api_integration.md         # 外部API仕様
│   └── architecture.md            # システムアーキテクチャ
├── src/
│   ├── ingestion/
│   │   ├── x_monitor.py           # X(IFTTT)監視スクリプト
│   │   ├── news_feed.py           # ニュースフィード取得
│   │   ├── reddit_monitor.py      # Reddit監視
│   │   └── webhook_server.py      # IFTTT受信Webhookサーバー
│   ├── analysis/
│   │   ├── llm_orchestrator.py    # 複数LLM統合スクリプト
│   │   ├── prompts.py             # LLMプロンプト定義
│   │   └── consensus_logic.py     # 合議制ロジック
│   ├── storage/
│   │   ├── db_manager.py          # PostgreSQL接続・操作
│   │   └── queries.sql            # SQL定義ファイル
│   ├── optimization/
│   │   ├── portfolio_optimizer.py # ポートフォリオ最適化
│   │   └── risk_manager.py        # リスク管理
│   ├── execution/
│   │   ├── trading_engine.py      # 売買実行エンジン
│   │   └── broker_api.py          # 証券会社API連携
│   └── main.py                    # メインオーケストレータ
├── config/
│   ├── config.example.yaml        # 設定テンプレート
│   └── .env.example               # 環境変数テンプレート
├── tests/
│   ├── test_analysis.py           # 分析ロジックのテスト
│   ├── test_db.py                 # DB操作のテスト
│   └── test_integration.py        # 統合テスト
├── logs/                          # ログファイル出力先
└── requirements.txt               # Python依存パッケージ
```

---

## セットアップ手順

### 前提条件
- Python 3.10+
- PostgreSQL 13+（またはSupabase無料枠）
- OpenAI API キー
- Google Gemini API キー
- Anthropic Claude API キー

### インストール

```bash
# リポジトリクローン
git clone https://github.com/Akier-X/auto-trade-system.git
cd auto-trade-system

# 仮想環境作成
python -m venv venv
source venv/bin/activate  # Linux/Mac
# または
venv\Scripts\activate  # Windows

# 依存パッケージインストール
pip install -r requirements.txt

# 環境変数設定
cp config/.env.example .env
# .envを編集して、各APIキーとDB設定を入力
```

### PostgreSQL初期化

```bash
# テーブル作成（詳細は docs/database_design.md）
psql -U postgres -d alpha_db -f src/storage/queries.sql
```

### IFTTT設定

詳細は → [docs/api_integration.md](docs/api_integration.md)

1. IFTTTアカウント作成
2. X (Twitter) トリガー設定：「New tweet by a specific user」
3. Webhookアクション設定：Pythonサーバーのエンドポイント指定

---

## 使用開始

```bash
# メインオーケストレータ起動
python src/main.py
```

---

## 開発状況

- [x] プロジェクト基本構成・ドキュメント整備
- [ ] PostgreSQL環境構築・初期テーブル作成
- [ ] Webhookサーバー実装（IFTTT連携）
- [ ] LLM並列呼び出し実装
- [ ] 合議制ロジック実装
- [ ] ポートフォリオ最適化エンジン
- [ ] 証券会社API連携
- [ ] 本番運用

---

## トラブルシューティング・FAQ

TBD

---

## ライセンス

MIT License

---

## 連絡先・サポート

Issuesはプロジェクト内で報告してください。
