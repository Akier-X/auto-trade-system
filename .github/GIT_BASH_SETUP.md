# Git Bash セットアップガイド

このガイドは、Git Bash 環境での Project Alpha 開発セットアップを説明します。

## Git Bash とは

Git Bash は、Windows で Unix/Linux コマンドを使用できるシェルです。
- WSL（Windows Subsystem for Linux）より軽量
- Git コマンドと統合
- Linux/Mac と同じコマンドで開発可能

---

## ステップ1: Git Bash のセットアップ

### インストール

1. https://git-scm.com/download/win からインストーラーをダウンロード
2. インストール時に「Use Git and optional Unix tools from Command Prompt」を選択
3. インストール完了

### 起動

```bash
# Windows キー を押す
# 「git bash」と入力して Enter
# または Git Bash ショートカットをダブルクリック
```

---

## ステップ2: .env ファイルセットアップ（推奨）

### .env ファイル作成

プロジェクトルートに `.env` ファイルを作成：

```bash
cd /d/auto-system/auto-trade-system
touch .env
```

### .env に記入

```bash
# .env の内容
GITHUB_TOKEN=ghp_xxxxx...
GITHUB_OWNER=Akier-X
GITHUB_REPO=auto-trade-system

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=alpha_db
DB_USER=app_user
DB_PASSWORD=your_password

# LLM APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...

# その他の設定
PRODUCTION_MODE=false
LOG_LEVEL=INFO
```

---

## ステップ3: Python 仮想環境セットアップ

```bash
# プロジェクトディレクトリへ
cd /d/auto-system/auto-trade-system

# 仮想環境作成
python -m venv venv

# 仮想環境を有効化（Git Bash）
source venv/Scripts/activate
# プロンプトが (venv) で始まればOK

# 依存パッケージをインストール
pip install -r requirements.txt
```

---

## ステップ4: スクリプト実行

```bash
# 仮想環境が有効化されている状態で実行
python scripts/create_github_issues.py
```

**成功すると**:
```
======================================================================
Creating Phase Issues...
======================================================================

✓ Created Issue #1: [Phase 1: PostgreSQL基盤構築] Week 1-2
✓ Created Issue #2: [Phase 2: マルチソースデータ取得] Week 3-4
...
```

---

## Git Bash コマンド早見表

```bash
# ディレクトリ移動（Windows パスの場合は /d/... を使用）
cd /d/auto-system/auto-trade-system

# ファイル作成
touch .env

# ファイル編集（nano）
nano .env
# または（VS Code で開く）
code .env

# 環境変数確認（.env から自動読み込みされる場合）
echo $GITHUB_TOKEN

# 仮想環境有効化
source venv/Scripts/activate

# 仮想環境無効化
deactivate

# Git コマンド
git status
git add .
git commit -m "message"
git push origin branch-name

# Python スクリプト実行
python scripts/create_github_issues.py

# ログを見る
tail -f logs/app.log

# ツリー表示
tree -L 2

# ファイル検索
find . -name "*.py" -type f
```

---

## 環境変数管理（Git Bash 推奨方法）

### 方法1: .env ファイル（最も推奨）

`.env` ファイルは `.gitignore` に含まれているため、Git リポジトリにはコミットされません。

```bash
# .env ファイルがあれば自動で読み込まれる（python-dotenv）
python scripts/create_github_issues.py
```

**利点**:
- ✅ 複数の開発環境で簡単に管理
- ✅ セキュアな設定値を Git に上げない
- ✅ チームメンバーは `.env.example` から `.env` を作成するだけ

### 方法2: ~/.bashrc に設定（永続設定）

```bash
# ~/.bashrc を開く
nano ~/.bashrc

# 最後に以下を追加
export GITHUB_TOKEN="ghp_xxxxx..."
export GITHUB_OWNER="Akier-X"
export GITHUB_REPO="auto-trade-system"
export DB_HOST="localhost"
export DB_USER="app_user"
export DB_PASSWORD="your_password"

# 保存（Ctrl + X → Y → Enter）

# 変更を反映
source ~/.bashrc

# 確認
echo $GITHUB_TOKEN
```

### 方法3: 起動スクリプト（最も自動化）

`.bashrc-project` というプロジェクト専用の設定ファイルを作成：

```bash
# プロジェクトルートに .bashrc-project を作成
cat > .bashrc-project << 'EOF'
# Project Alpha 環境設定
export GITHUB_TOKEN="ghp_xxxxx..."
export GITHUB_OWNER="Akier-X"
export GITHUB_REPO="auto-trade-system"

# 仮想環境自動有効化
if [ -f "venv/Scripts/activate" ]; then
    source venv/Scripts/activate
fi

# プロンプト表示
echo "🚀 Project Alpha environment loaded"
echo "📁 Working directory: $(pwd)"
echo "🐍 Python: $(python --version)"
if [ ! -z "$VIRTUAL_ENV" ]; then
    echo "✅ Virtual environment: $(basename $VIRTUAL_ENV)"
fi
EOF

# Git Bash 起動時に自動読み込みするように ~/.bashrc に追加
echo "source ~/auto-trade-system/.bashrc-project" >> ~/.bashrc
source ~/.bashrc
```

---

## Git Bash での開発フロー

### 毎日のスタートアップ

```bash
# 1. Git Bash を起動

# 2. プロジェクトディレクトリへ（または自動で読み込まれている場合はスキップ）
cd /d/auto-system/auto-trade-system

# 3. 仮想環境を有効化
source venv/Scripts/activate

# 4. 最新コードを取得
git pull origin claude/x-post-data-retrieval-EwVYv

# 5. 開発開始
```

### コミット & プッシュ

```bash
# 1. 変更状況確認
git status

# 2. ファイルをステージング
git add src/analysis/llm_orchestrator.py

# 3. コミット
git commit -m "Feat: Implement LLM orchestrator for parallel API calls"

# 4. プッシュ
git push origin claude/x-post-data-retrieval-EwVYv
```

### テスト実行

```bash
# すべてのテスト
pytest tests/

# 特定のテスト
pytest tests/test_analysis.py

# カバレッジ
pytest --cov=src tests/

# 詳細ログ
pytest -v -s tests/
```

---

## トラブルシューティング

### Q: `python` コマンドが見つからない
**A**:
```bash
# Python のパスを確認
which python

# または python3 を使用
python3 --version
```

### Q: `.env` ファイルが読み込まれない
**A**:
```bash
# python-dotenv がインストールされているか確認
pip list | grep dotenv

# インストール
pip install python-dotenv
```

### Q: 仮想環境が有効化されない
**A**:
```bash
# activate スクリプトのパスを確認
ls -la venv/Scripts/

# 実行権限を付与
chmod +x venv/Scripts/activate

# 再度有効化
source venv/Scripts/activate
```

### Q: Git コマンドが遅い
**A**:
- Windows Defender の除外リストにプロジェクトフォルダを追加
- または WSL2 (Windows Subsystem for Linux) への移行を検討

---

## 推奨：プロジェクト専用の起動スクリプト

プロジェクトを開くたびに自動セットアップする `start.sh` を作成：

```bash
#!/bin/bash
# scripts/start.sh

echo "🚀 Project Alpha - Git Bash Environment Setup"
echo "=============================================="

# 1. ディレクトリ確認
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "📁 Project Root: $PROJECT_ROOT"
cd "$PROJECT_ROOT"

# 2. 仮想環境有効化
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python -m venv venv
fi
echo "🐍 Activating virtual environment..."
source venv/Scripts/activate

# 3. 依存パッケージ確認
echo "📚 Installing dependencies..."
pip install -q -r requirements.txt 2>/dev/null

# 4. 環境変数確認
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found!"
    echo "📝 Please create .env file using config/.env.example as template"
    echo "   cp config/.env.example .env"
    echo "   nano .env"
else
    echo "✅ .env file loaded"
fi

# 5. Git 状態確認
echo ""
echo "📊 Repository Status:"
git status --short

# 6. 準備完了
echo ""
echo "✨ Environment ready!"
echo "📝 Next steps:"
echo "   python scripts/create_github_issues.py  # Create GitHub issues"
echo "   pytest tests/                           # Run tests"
echo "   code .                                  # Open in VS Code"
echo ""
```

起動方法：
```bash
# スクリプトを実行可能にする
chmod +x scripts/start.sh

# 実行
./scripts/start.sh
```

---

## VS Code との統合（推奨）

### Git Bash を デフォルトシェルに設定

1. **VS Code を開く**
2. **Ctrl + Shift + P** → `Terminal: Select Default Profile`
3. **Git Bash** を選択

### VS Code 拡張機能（推奨）

```bash
# VS Code 内のターミナルで実行
code --install-extension ms-python.python
code --install-extension ms-python.vscode-pylance
code --install-extension github.copilot
code --install-extension eamodio.gitlens
code --install-extension ms-vscode.makefile-tools
```

---

## まとめ：Git Bash での開発フロー

```bash
# 1回目セットアップ（初回のみ）
cd /d/auto-system/auto-trade-system
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt
cp config/.env.example .env
nano .env  # トークン等を入力

# 2回目以降の毎日のセットアップ
cd /d/auto-system/auto-trade-system
source venv/Scripts/activate

# 開発開始
python scripts/create_github_issues.py
pytest tests/
git status
git add .
git commit -m "message"
git push origin claude/x-post-data-retrieval-EwVYv
```

---

**最終更新**: 2026年2月
**対象**: Git Bash ユーザー向けセットアップガイド
