#!/bin/bash
# ============================================================================
# Project Alpha - Git Bash Environment Setup Script
# ============================================================================
# このスクリプトは、Project Alpha の開発環境を自動セットアップします。
# Git Bash 環境を想定しています。
#
# 使用方法:
#   ./scripts/setup.sh
#
# 実行内容:
#   1. Python 仮想環境の作成
#   2. 依存パッケージのインストール
#   3. .env ファイルの作成
#   4. Git リポジトリの確認
#   5. プロジェクト情報の表示
# ============================================================================

set -e  # エラーが発生したら即座に終了

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'  # No Color

# プロジェクトルート取得
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# ============================================================================
# ロゴ表示
# ============================================================================
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Project Alpha: Multi-Source AI Trading System              ║${NC}"
echo -e "${BLUE}║            Environment Setup for Git Bash                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================================
# ステップ 1: Python バージョン確認
# ============================================================================
echo -e "${YELLOW}[1/5]${NC} Checking Python installation..."
if ! command -v python &> /dev/null; then
    echo -e "${RED}✗ Python is not installed${NC}"
    echo "   Please install Python 3.10+ from https://www.python.org/"
    exit 1
fi

PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
echo -e "${GREEN}✓${NC} Python ${PYTHON_VERSION} found"
echo ""

# ============================================================================
# ステップ 2: 仮想環境の作成
# ============================================================================
echo -e "${YELLOW}[2/5]${NC} Setting up virtual environment..."
if [ -d "venv" ]; then
    echo -e "   ${GREEN}✓${NC} Virtual environment already exists"
else
    echo -e "   Creating venv..."
    python -m venv venv
    echo -e "   ${GREEN}✓${NC} Virtual environment created"
fi

# 仮想環境を有効化
source venv/Scripts/activate
echo -e "   ${GREEN}✓${NC} Virtual environment activated"
echo ""

# ============================================================================
# ステップ 3: 依存パッケージのインストール
# ============================================================================
echo -e "${YELLOW}[3/5]${NC} Installing dependencies..."
echo "   This may take a few minutes..."
pip install -q -r requirements.txt 2>/dev/null
echo -e "   ${GREEN}✓${NC} Dependencies installed"
echo ""

# ============================================================================
# ステップ 4: .env ファイルの作成
# ============================================================================
echo -e "${YELLOW}[4/5]${NC} Configuring .env file..."
if [ -f ".env" ]; then
    echo -e "   ${GREEN}✓${NC} .env file already exists"
else
    echo -e "   Creating .env from template..."
    cp config/.env.example .env
    echo -e "   ${GREEN}✓${NC} .env file created"
    echo ""
    echo -e "   ${YELLOW}⚠️  IMPORTANT:${NC} Please edit .env file and set:"
    echo "      • GITHUB_TOKEN (from https://github.com/settings/tokens)"
    echo "      • DB_PASSWORD (or leave as is for local dev)"
    echo "      • LLM API Keys (OpenAI, Anthropic, Google)"
    echo ""
    echo "   To edit: nano .env"
    echo ""
fi

# ============================================================================
# ステップ 5: Git リポジトリ確認
# ============================================================================
echo -e "${YELLOW}[5/5]${NC} Checking Git repository..."
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "   ${RED}✗${NC} Not a Git repository"
    exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT=$(git rev-parse --short HEAD)
echo -e "   ${GREEN}✓${NC} Branch: ${BLUE}${BRANCH}${NC}"
echo -e "   ${GREEN}✓${NC} Latest commit: ${BLUE}${COMMIT}${NC}"
echo ""

# ============================================================================
# セットアップ完了
# ============================================================================
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  ✨ Setup Complete! ✨                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BLUE}Project Information:${NC}"
echo "  📁 Root:        ${PROJECT_ROOT}"
echo "  🐍 Python:      ${PYTHON_VERSION}"
echo "  🔗 Git Branch:  ${BRANCH}"
echo "  📦 venv:        venv/Scripts/activate"
echo ""

echo -e "${BLUE}Next Steps:${NC}"
if [ ! -f ".env" ] || ! grep -q "GITHUB_TOKEN" .env 2>/dev/null; then
    echo "  1️⃣  Edit .env file and set GITHUB_TOKEN:"
    echo "     nano .env"
    echo "  2️⃣  Generate token at: https://github.com/settings/tokens"
    echo "  3️⃣  Run GitHub Issues creator:"
    echo "     python scripts/create_github_issues.py"
else
    echo "  1️⃣  Create GitHub Issues:"
    echo "     python scripts/create_github_issues.py"
fi
echo "  2️⃣  Run tests:"
echo "     pytest tests/"
echo "  3️⃣  Start development:"
echo "     code ."
echo ""

echo -e "${BLUE}Documentation:${NC}"
echo "  📖 Setup Guide:      .github/GIT_BASH_SETUP.md"
echo "  📖 ROADMAP:          ROADMAP.md"
echo "  📖 Database Design:  docs/database_design.md"
echo "  📖 Architecture:     docs/system_architecture.md"
echo ""

echo -e "${YELLOW}💡 Tip:${NC} Virtual environment is already activated!"
echo "    Type 'deactivate' to exit, or just close the terminal."
echo ""
