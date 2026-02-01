# Project Alpha: Project Board Setup Guide

このドキュメントは、GitHub Project Boardでプロジェクトを管理するためのガイドです。

## クイックスタート

### 方法1: 自動スクリプトでIssuesを作成（推奨）

```bash
# GitHub Personal Access Token を生成
# https://github.com/settings/tokens → "repo" スコープでトークン生成

# 環境変数を設定
export GITHUB_TOKEN="ghp_xxxxx..."
export GITHUB_OWNER="Akier-X"
export GITHUB_REPO="auto-trade-system"

# スクリプト実行
python scripts/create_github_issues.py
```

### 方法2: 手動でプロジェクトボードを作成

1. **新規プロジェクト作成**
   - https://github.com/users/Akier-X/projects → "New project"
   - プロジェクト名: "Project Alpha: Multi-Source AI Trading"
   - テンプレート: "Table"

2. **ビューを作成**
   - Default view: "Status" (Not started, In progress, Done)
   - Custom view: "Phase" (Phase 1, Phase 2, ... Phase 5)
   - Custom view: "Priority" (Critical, High, Medium, Low)

3. **Issuesをプロジェクトに追加**
   - リポジトリのIssuesセクションから各Issueを開く
   - 右側パネルから "Project" を選択
   - "Project Alpha" を選択

---

## Project Board 構成

### ビュー1: Status（ステータス別）

```
┌─────────────────────────────────────────────────────────────────┐
│ Not Started     │ In Progress    │ In Review      │ Done         │
├─────────────────────────────────────────────────────────────────┤
│ Phase 1        │ Phase 2        │ Database       │ Documentation│
│ Phase 3        │ LLM Analyzer   │ Setup Script   │              │
│ Phase 4        │                │                │              │
│ Phase 5        │                │                │              │
└─────────────────────────────────────────────────────────────────┘
```

### ビュー2: Priority（優先度別）

```
┌─────────────────────────────────────────────────────────────────┐
│ Critical       │ High           │ Medium         │ Low          │
├─────────────────────────────────────────────────────────────────┤
│ Phase 1        │ Phase 4        │ Tests          │ Documentation│
│ Phase 2        │ Phase 5        │ Monitoring     │ Examples     │
│ Phase 3        │                │                │              │
└─────────────────────────────────────────────────────────────────┘
```

### ビュー3: Phase（フェーズ別）

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1        │ Phase 2        │ Phase 3        │ Phase 4/5   │
├─────────────────────────────────────────────────────────────────┤
│ Database       │ Webhook        │ LLM Orches.    │ Portfolio   │
│ stocks_master  │ News Feed      │ Prompts        │ Risk Mgmt   │
│ Tables         │ Reddit         │ Consensus      │ Broker API  │
│                │ TDnet          │ DB Save        │ Dashboard   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Issues & Tasks リスト

### Phase 1: PostgreSQL 基盤構築 (Week 1-2)

| # | Task | Est. Hours | Labels |
|---|------|-----------|--------|
| 1-1 | PostgreSQL環境構築 | 4h | database, setup, critical |
| 1-2 | stocks_master テーブル作成 | 6h | database, ddl, critical |
| 1-3 | 基盤テーブル設計・作成 | 8h | database, ddl, critical |

### Phase 2: マルチソース データ取得 (Week 3-4)

| # | Task | Est. Hours | Labels |
|---|------|-----------|--------|
| 2-1 | X（Twitter）データ取得 | 6h | ingestion, ifttt, critical |
| 2-2 | ニュース/RSSフィード取得 | 4h | ingestion, news, critical |
| 2-3 | Reddit投稿監視 | 4h | ingestion, reddit, critical |
| 2-4 | 適時開示（TDnet）取得 | 5h | ingestion, tdnet, critical |

### Phase 3: AI分析エンジン (Week 5-7)

| # | Task | Est. Hours | Labels |
|---|------|-----------|--------|
| 3-1 | 複数LLM並列呼び出し | 8h | analysis, llm, critical |
| 3-2 | プロンプト定義・テンプレート | 6h | analysis, prompts, critical |
| 3-3 | 合議制スコアリング | 6h | analysis, consensus, critical |
| 3-4 | DB保存ロジック | 4h | analysis, database, critical |

### Phase 4: メモリ化・RAG (Week 8-9)

| # | Task | Est. Hours | Labels |
|---|------|-----------|--------|
| 4-1 | pgvector導入・セットアップ | 3h | database, vector, high |
| 4-2 | Embedding生成パイプライン | 4h | analysis, embedding, high |
| 4-3 | 相関分析・メモリ検索 | 5h | analysis, memory, high |

### Phase 5: 最適化・自動売買 (Week 10-12)

| # | Task | Est. Hours | Labels |
|---|------|-----------|--------|
| 5-1 | ポートフォリオ最適化エンジン | 6h | optimization, portfolio, high |
| 5-2 | リスク管理エンジン | 4h | optimization, risk, high |
| 5-3 | 証券会社API連携 | 8h | execution, broker-api, high |
| 5-4 | モニタリング・ダッシュボード | 6h | monitoring, ui, high |

### Database Tables

| Table ID | Table Name | Purpose | Importance |
|----------|-----------|---------|-----------|
| t1 | stocks_master | 全銘柄マスター | ⭐⭐⭐⭐⭐ |
| t2 | raw_tweets | X投稿の生データ | ⭐⭐⭐⭐ |
| t3 | raw_news | ニュース記事 | ⭐⭐⭐⭐ |
| t4 | raw_reddit | Reddit投稿 | ⭐⭐⭐ |
| t5 | raw_tdnet | 適時開示 | ⭐⭐⭐⭐ |
| t6 | intelligence_memory | マルチソース統合 | ⭐⭐⭐⭐⭐ |
| t7 | monitored_tickers | 監視対象銘柄 | ⭐⭐⭐⭐ |
| t8 | analysis_scores | LLMスコア | ⭐⭐⭐⭐ |
| t9 | final_consensus | 合議結果 | ⭐⭐⭐⭐⭐ |
| t10 | portfolio_mgmt | 資産管理 | ⭐⭐⭐⭐⭐ |
| t11 | trade_history | 売買履歴 | ⭐⭐⭐⭐ |
| t12 | source_performance | 的中率統計 | ⭐⭐⭐ |

---

## ラベル（Labels）定義

### カテゴリラベル
- `database` - DB関連
- `ingestion` - データ取得
- `analysis` - AI分析
- `optimization` - 最適化
- `execution` - 売買実行
- `monitoring` - 監視・ダッシュボード

### 優先度ラベル
- `priority-critical` - 緊急（Phase進行に必須）
- `priority-high` - 高（早期実装推奨）
- `priority-medium` - 中
- `priority-low` - 低（オプション機能）

### フェーズラベル
- `phase-1` - Phase 1
- `phase-2` - Phase 2
- `phase-3` - Phase 3
- `phase-4` - Phase 4
- `phase-5` - Phase 5

### テクノロジーラベル
- `llm` - LLM関連
- `postgres` - PostgreSQL
- `api` - API統合
- `asyncio` - 非同期処理
- `vector` - ベクトル検索

### ステータスラベル
- `status-not-started` - 未開始
- `status-in-progress` - 進行中
- `status-blocked` - ブロック中
- `status-review` - レビュー待ち
- `status-done` - 完了

---

## Project Board 設定

### 推奨されるカスタムフィールド

1. **Estimated Hours**
   - Type: Number
   - Default: 0
   - 説明: タスク予定時間

2. **Actual Hours**
   - Type: Number
   - Default: 0
   - 説明: 実績時間

3. **Phase**
   - Type: Single select
   - Options: Phase 1, 2, 3, 4, 5
   - 説明: 属するフェーズ

4. **Priority**
   - Type: Single select
   - Options: Critical, High, Medium, Low
   - 説明: 優先度

5. **Status**
   - Type: Single select
   - Options: Not Started, In Progress, In Review, Done, Blocked
   - 説明: ステータス

---

## 進捗追跡のコツ

### Week 単位での確認
```
Week 1-2 完了率: Phase 1 のタスク完了数 / 3
Week 3-4 完了率: Phase 2 のタスク完了数 / 4
Week 5-7 完了率: Phase 3 のタスク完了数 / 4
Week 8-9 完了率: Phase 4 のタスク完了数 / 3
Week 10-12 完了率: Phase 5 のタスク完了数 / 4
```

### KPI（Key Performance Indicators）
- **予定対比完了率**: (完了時間 / 予定時間) × 100%
- **Phase別完了率**: 各Phaseの完了タスク数 / 総タスク数
- **総予定時間**: 62時間（すべてのタスク合計）

---

## 参考資料

- [ROADMAP.md](../ROADMAP.md) - 詳細な実装計画
- [Database Design](../docs/database_design.md) - DB仕様書
- [System Architecture](../docs/system_architecture.md) - システム設計
- [project-tasks.json](./project-tasks.json) - タスク定義（JSON形式）

---

## GitHub Project Board URL

プロジェクトボードが作成されたら、以下のURLでアクセス可能です：

```
https://github.com/users/Akier-X/projects/[PROJECT_ID]
```

または、リポジトリから：

```
https://github.com/Akier-X/auto-trade-system/projects
```

---

**最終更新**: 2026年2月
**バージョン**: 1.0.0
