# Contributing to Project Alpha

このドキュメントは、Project Alpha プロジェクトへの貢献方法をガイドします。

## ワークフロー

### 1. Issue の確認

プロジェクトボード（https://github.com/users/Akier-X/projects）から、対応するIssueを確認します。

```
Priority の高い順（Critical → High）で作業を進める
```

### 2. ブランチ作成

```bash
# Issue #123 に対応する場合
git checkout -b feature/issue-123-feature-name

# 例：Issue #5（X監視パイプライン）
git checkout -b feature/issue-5-x-webhook-pipeline
```

**ブランチ命名規則**:
```
feature/issue-[number]-[short-description]
```

### 3. 実装・テスト

```bash
# 依存パッケージの更新（必要に応じて）
pip install -r requirements.txt

# 実装コード
# src/ 以下に実装を追加

# テスト実行
pytest tests/

# コード品質チェック
black src/
flake8 src/
mypy src/
```

### 4. Commit & Push

```bash
# コミットメッセージ形式
git commit -m "Fix: [Issue #123] X webhook pipeline implementation

## Changes
- Implemented Flask webhook server for X/Twitter
- Added raw_tweets table INSERT logic
- Implemented error handling

## Testing
- Unit test: test_webhook_receiver
- Integration test: test_ifttt_payload

Fixes #123
"

# プッシュ
git push origin feature/issue-123-x-webhook-pipeline
```

**Commit メッセージの規則**:
```
Type: [Issue #number] Short description

## Changes
- Change 1
- Change 2

## Testing
- Test 1
- Test 2

Fixes #[issue_number]
```

**Typeの種類**:
- `Feat`: 新機能
- `Fix`: バグ修正
- `Refactor`: リファクタリング
- `Test`: テスト追加
- `Docs`: ドキュメント更新
- `Chore`: 依存パッケージ更新等

### 5. Pull Request 作成

```bash
# GitHubウェブUIから Pull Request を作成
# または gh CLIを使用：

gh pr create \
  --title "Implement X webhook pipeline (Fixes #123)" \
  --body "See Issue #123 for details" \
  --labels "phase-2,ingestion" \
  --assignee @yourself
```

### 6. Code Review & Merge

- 最低1人のレビュアーによるレビュー
- すべてのテスト pass 必須
- CI/CD チェック pass 必須

---

## Issue 対応のガイド

### Phase 1: PostgreSQL 基盤構築

**Issue 例：#1 - PostgreSQL環境構築**

```markdown
## Checklist
- [ ] PostgreSQL インストール確認
- [ ] DB接続テスト成功
- [ ] .env 設定完了
- [ ] バックアップ戦略定義

## Acceptance Criteria
- ✓ psql接続成功
- ✓ Database created
- ✓ User created with privileges
```

**対応フロー**:
1. Issue を "In Progress" に変更
2. `feature/issue-1-postgresql-setup` ブランチで作業
3. SETUP.md に手順を追加
4. Pull Request で提出
5. レビュー完了後 merge

### Phase 2: マルチソースデータ取得

**Issue 例：#5 - X（Twitter）データ取得パイプライン**

```markdown
## Acceptance Criteria
- ✓ Flask Webhook サーバー実装
- ✓ IFTTT設定完了
- ✓ テスト投稿受信確認
- ✓ raw_tweets テーブルへのINSERT確認
```

**実装ファイル**:
- `src/ingestion/webhook_server.py` - Flaskサーバー
- `src/ingestion/x_monitor.py` - X監視ロジック
- `tests/test_webhook.py` - テストコード

### Phase 3: AI分析エンジン

**Issue 例：#10 - 複数LLM並列呼び出しスクリプト**

```markdown
## Acceptance Criteria
- ✓ asyncio実装
- ✓ OpenAI API統合
- ✓ Anthropic API統合
- ✓ Google Gemini API統合
- ✓ レート制限対応
```

**実装ファイル**:
- `src/analysis/llm_orchestrator.py` - LLM統合
- `src/analysis/prompts.py` - プロンプト定義
- `tests/test_llm_analysis.py` - テスト

---

## テスト戦略

### ユニットテスト

```python
# tests/test_analysis.py の例

def test_emoji_extraction():
    """銘柄コード抽出テスト"""
    text = "日本電信電話 (9432) を買い始めるべき"
    result = extract_tickers(text)
    assert "9432" in result['tickers']

def test_sentiment_analysis():
    """センチメント分析テスト"""
    positive_text = "この銘柄は今後上昇する可能性が非常に高い"
    result = analyze_sentiment(positive_text)
    assert result['sentiment'] == 'POSITIVE'
```

### 統合テスト

```python
# tests/test_integration.py の例

def test_end_to_end_pipeline():
    """E2E テスト：入力から出力まで"""
    # 1. raw_tweets にデータ挿入
    # 2. LLM分析実行
    # 3. final_consensus が生成されるか確認
    pass
```

### テスト実行

```bash
# すべてのテスト実行
pytest tests/

# 特定のテストファイル実行
pytest tests/test_analysis.py

# カバレッジ報告
pytest --cov=src tests/

# 詳細ログ
pytest -v -s tests/
```

---

## ドキュメント更新

### ファイル構成

```
.github/
├── CONTRIBUTING.md        # このファイル
├── PROJECT_BOARD.md       # プロジェクトボード管理
├── project-tasks.json     # タスク定義（JSON）
└── workflows/             # GitHub Actions CI/CD
    └── tests.yml          # テスト実行ワークフロー

docs/
├── README.md              # 概要
├── ROADMAP.md             # 実装計画
├── database_design.md     # DB設計書
└── system_architecture.md # システム設計

src/
├── ingestion/             # データ取得モジュール
├── analysis/              # AI分析モジュール
├── storage/               # DB操作モジュール
├── optimization/          # 最適化モジュール
└── execution/             # 売買実行モジュール
```

### ドキュメント更新時の規則

```bash
# ドキュメント更新ブランチ
git checkout -b docs/update-database-design

# コミット
git commit -m "Docs: Update database design for Phase 1"

# Push & PR
git push origin docs/update-database-design
```

---

## GitHub Actions CI/CD

### テスト自動実行

```yaml
# .github/workflows/tests.yml

name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      - run: pip install -r requirements.txt
      - run: pytest tests/
      - run: black --check src/
      - run: flake8 src/
```

### PR チェック項目

- [ ] すべてのテスト pass
- [ ] コード品質チェック pass（black, flake8, mypy）
- [ ] ドキュメント更新完了
- [ ] Issue との紐付け完了
- [ ] ブランチ最新化完了

---

## コミュニケーション

### Issue に関する質問

```markdown
## Question
I have a question about Issue #5...

## Context
Currently implemented X at this way...

## Question
Should we use approach A or approach B?

@reviewer please advise
```

### ブロッカー報告

```markdown
## Blocker 🚨

Issue #10 は以下の理由で進行不可：
- Gemini API の quota が不足
- 対応: Team lead に相談

予定: 1日遅延予想
```

---

## ルールとベストプラクティス

### DO ✅
- Issue を作成して、何をするかを明確にしてから実装開始
- テストを先に書く（TDD推奨）
- コミットメッセージを詳細に
- ドキュメント・コメントを充実させる
- コードレビューのフィードバックに対応

### DON'T ❌
- Issue なしで大きな実装をしない
- テストなしで merge を要求しない
- コミットメッセージなく push しない
- ドキュメント更新を忘れない
- 他人の実装を確認なく修正しない

---

## よくある質問（FAQ）

### Q: Issue をどうやって選べば良い？
**A**: Phase 順に、priority が Critical > High の順で進める。

### Q: テストが多くて時間がかかる
**A**: テストは品質保証。後でバグが出るより効率的。

### Q: ドキュメント更新が面倒
**A**: 実装と同時に更新すると楽。テンプレート活用推奨。

### Q: PR がなかなか merge されない
**A**: レビュアーが忙しい可能性。コメントで進捗確認してOK。

---

## 参考資料

- [ROADMAP.md](../ROADMAP.md) - 実装計画
- [Database Design](../docs/database_design.md) - DB仕様
- [System Architecture](../docs/system_architecture.md) - システム設計
- [PROJECT_BOARD.md](./PROJECT_BOARD.md) - プロジェクト管理

---

**最終更新**: 2026年2月
**メンテナー**: Akier-X
