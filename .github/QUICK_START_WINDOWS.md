# GitHub Issues 作成 - Windows ユーザー向けクイックスタート

あなたは Windows で実行しており、`401 Unauthorized` エラーが出ています。
以下の手順に従ってください。

---

## 【5分で完了】トークン取得と設定

### ステップ1: GitHub トークン生成（3分）

1. **ブラウザで開く**
   ```
   https://github.com/settings/tokens
   ```
   - Akier-X アカウントでログインしていることを確認

2. **「Generate new token (classic)」をクリック**

3. **以下を設定**
   - **Token name**: `Project Alpha Issue Creator`
   - **Expiration**: `90 days` または `No expiration`
   - **Scope**: `repo` にチェック（自動的に他の項目も有効化されます）

4. **「Generate token」をクリック**
   - 🔴 **重要**: トークンが表示されます。コピーして保存してください（2度と表示されません！）
   - 例: `ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456`

---

### ステップ2: Windows で環境変数を設定（2分）

#### 方法1: PowerShell（最も簡単）

1. **PowerShell を開く**
   - Windows キー + X → Windows PowerShell
   - または、Anaconda Prompt（Conda の場合）

2. **以下のコマンドを実行**（トークンは上記でコピーしたもの）
   ```powershell
   $env:GITHUB_TOKEN='ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456'
   ```

3. **設定確認**
   ```powershell
   echo $env:GITHUB_TOKEN
   ```
   - `ghp_aBc...` が表示されればOK

#### 方法2: .env ファイル（永続的）

1. **プロジェクトディレクトリに .env ファイルを作成**
   ```
   D:\auto-system\auto-trade-system\.env
   ```

2. **以下の内容を入力**
   ```
   GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456
   GITHUB_OWNER=Akier-X
   GITHUB_REPO=auto-trade-system
   ```

3. **保存**

このやり方だと、PowerShell を再起動しても設定が保持されます。

---

## 【実行】スクリプト実行

### PowerShell での実行

1. **プロジェクトディレクトリに移動**
   ```powershell
   cd D:\auto-system\auto-trade-system
   ```

2. **スクリプト実行**
   ```powershell
   python scripts/create_github_issues.py
   ```

3. **実行結果の確認**

   **成功時**:
   ```
   ======================================================================
   Creating Phase Issues...
   ======================================================================

   ✓ Created Issue #1: [Phase 1: PostgreSQL基盤構築] Week 1-2
   ✓ Created Issue #2: [Phase 2: マルチソースデータ取得] Week 3-4
   ...
   ✓ Created Issue #35: [Database] Create table: source_performance

   ======================================================================
   SUMMARY
   ======================================================================

   Total Issues Created: 35
   Issue Numbers: #1, #2, #3, ...

   View all issues: https://github.com/Akier-X/auto-trade-system/issues
   ```

   **失敗時**:
   ```
   ✗ Failed to create issue: ...
   Error: 401 Client Error: Unauthorized
   💡 Hint: Invalid or expired token. Check GITHUB_TOKEN value.
   ```

   → ステップ2 を再度確認してください

---

## トラブルシューティング

### Q: `401 Unauthorized` エラーが出ます
**A**:
- トークンがコピーできているか確認: `echo $env:GITHUB_TOKEN`
- トークンの有効期限を確認: https://github.com/settings/tokens
- 新しいトークンを生成してから再実行

### Q: `python: command not found` エラーが出ます
**A**:
- `python --version` で Python がインストールされているか確認
- Path が通っているか確認（Anaconda を使用している場合は Anaconda Prompt を開く）

### Q: `ModuleNotFoundError: No module named 'requests'` エラーが出ます
**A**:
```powershell
pip install -r requirements.txt
```

### Q: スクリプトが何も実行されない・反応がない
**A**:
- Ctrl + C で停止してから、デバッグ情報を見る
- スクリプトが古い可能性: `git pull origin claude/x-post-data-retrieval-EwVYv`

---

## 【次のステップ】GitHub Projects ボードの作成

スクリプトが成功したら、Issues が自動生成されます。

### GitHub Project Board を作成

1. **ブラウザで GitHub Projects に移動**
   ```
   https://github.com/users/Akier-X/projects
   ```

2. **「New project」をクリック**

3. **設定**
   - **Project name**: `Project Alpha: Multi-Source AI Trading System`
   - **Description**: `Automated trading system with multi-source intelligence`
   - **Template**: `Table`

4. **Issues を追加**
   - リポジトリから Issues を開く: https://github.com/Akier-X/auto-trade-system/issues
   - 各 Issue の右側パネルで "Projects" → "Project Alpha" を選択

詳しくは: [.github/PROJECT_BOARD.md](.github/PROJECT_BOARD.md)

---

## コマンド早見表

```powershell
# トークン設定（PowerShell）
$env:GITHUB_TOKEN='ghp_xxxxx...'

# トークン確認
echo $env:GITHUB_TOKEN

# プロジェクトディレクトリへ移動
cd D:\auto-system\auto-trade-system

# 依存パッケージのインストール
pip install -r requirements.txt

# スクリプト実行
python scripts/create_github_issues.py

# git 最新化
git pull origin claude/x-post-data-retrieval-EwVYv
```

---

## サポート

問題が生じた場合：
1. [.github/GITHUB_TOKEN_SETUP.md](.github/GITHUB_TOKEN_SETUP.md) の詳細版ガイドを参照
2. https://github.com/Akier-X/auto-trade-system/issues で既知の問題を確認
3. スクリプトのエラーメッセージを読む（ヒント付き）

---

**最終更新**: 2026年2月
**対象**: Windows ユーザー向けクイックスタート
