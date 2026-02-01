# GitHub Token 設定ガイド

GitHub API を使用して自動的に Issues を作成するため、Personal Access Token を設定します。

## ステップ1: Personal Access Token の生成

### 方法A: GitHub Web UI（推奨）

1. **GitHub ログイン**
   - https://github.com にログイン（Akier-Xアカウント）

2. **Settings へ移動**
   - 右上のプロフィール アイコン → Settings
   - または直接: https://github.com/settings/profile

3. **Developer settings へ移動**
   - 左サイドバー → Developer settings
   - または直接: https://github.com/settings/tokens

4. **Personal access tokens → Tokens (classic)**
   - https://github.com/settings/tokens
   - 「Generate new token」をクリック
   - または「Generate new token (classic)」をクリック

5. **トークン設定**
   - **Token name**: `Project Alpha Issue Creator` など分かりやすい名前
   - **Expiration**: 90 days または No expiration
   - **Scopes**: 以下を選択
     - ✅ `repo` - Full control of private repositories
       - このスコープ内に自動的に以下が含まれます：
         - `repo:status` - Access commit status
         - `repo_deployment` - Access deployment status
         - `public_repo` - Access public repositories
   - **Generate token** をクリック

6. **トークンをコピー**
   - 🔴 **重要**: トークンは1度だけ表示されます！
   - トークンをコピー: `ghp_xxxxx...` の形式

---

## ステップ2: 環境変数の設定

### Windows ユーザー

#### 方法1: PowerShell（一時的・現在のセッションのみ）
```powershell
$env:GITHUB_TOKEN='ghp_xxxxx...'
$env:GITHUB_OWNER='Akier-X'
$env:GITHUB_REPO='auto-trade-system'

# 確認
echo $env:GITHUB_TOKEN
```

#### 方法2: Command Prompt（一時的）
```cmd
set GITHUB_TOKEN=ghp_xxxxx...
set GITHUB_OWNER=Akier-X
set GITHUB_REPO=auto-trade-system

# 確認
echo %GITHUB_TOKEN%
```

#### 方法3: 永続的に設定（システム環境変数）
1. **Windows キー + R** を押す
2. `sysdm.cpl` と入力して Enter
3. **詳細設定** タブ → **環境変数(N)** をクリック
4. **新規(N)** をクリック（ユーザー環境変数）
   - 変数名: `GITHUB_TOKEN`
   - 変数値: `ghp_xxxxx...`
5. **OK** をクリック
6. **Windows を再起動**（または PowerShell を再起動）

#### 方法4: .env ファイル（推奨・プロジェクトごと）

プロジェクトディレクトリに `.env` ファイルを作成：

```bash
# auto-trade-system/.env
GITHUB_TOKEN=ghp_xxxxx...
GITHUB_OWNER=Akier-X
GITHUB_REPO=auto-trade-system
```

スクリプトを修正して .env から読み込むようにします：

```python
from dotenv import load_dotenv
load_dotenv()
token = os.getenv('GITHUB_TOKEN')
```

---

### Mac / Linux ユーザー

#### 方法1: bash / zsh（一時的）
```bash
export GITHUB_TOKEN='ghp_xxxxx...'
export GITHUB_OWNER='Akier-X'
export GITHUB_REPO='auto-trade-system'

# 確認
echo $GITHUB_TOKEN
```

#### 方法2: 永続的に設定
`~/.bashrc` または `~/.zshrc` に追加：
```bash
export GITHUB_TOKEN='ghp_xxxxx...'
export GITHUB_OWNER='Akier-X'
export GITHUB_REPO='auto-trade-system'
```

その後：
```bash
source ~/.bashrc  # or ~/.zshrc
```

---

## ステップ3: トークンが正しく設定されているか確認

### 方法1: Python スクリプトで確認
```python
import os
token = os.getenv('GITHUB_TOKEN')
print(f"Token is set: {bool(token)}")
if token:
    print(f"Token preview: {token[:10]}...{token[-10:]}")
else:
    print("ERROR: GITHUB_TOKEN is not set")
```

実行：
```bash
python -c "import os; token = os.getenv('GITHUB_TOKEN'); print(f'Token set: {bool(token)}')"
```

### 方法2: API テスト
```bash
curl -H "Authorization: token ghp_xxxxx..." https://api.github.com/user
```

成功すれば、GitHubアカウント情報が JSON で返されます。

---

## ステップ4: スクリプト実行

### 実行方法

#### Windows PowerShell
```powershell
# トークン設定（上記のいずれかの方法）
$env:GITHUB_TOKEN='ghp_xxxxx...'

# スクリプト実行
cd D:\auto-system\auto-trade-system
python scripts/create_github_issues.py
```

#### Windows Command Prompt
```cmd
set GITHUB_TOKEN=ghp_xxxxx...
cd D:\auto-system\auto-trade-system
python scripts/create_github_issues.py
```

#### Mac / Linux
```bash
export GITHUB_TOKEN='ghp_xxxxx...'
cd /path/to/auto-trade-system
python scripts/create_github_issues.py
```

---

## トラブルシューティング

### エラー: `401 Unauthorized`
```
✗ Failed to create issue: ...
  Error: 401 Client Error: Unauthorized
```

**原因**: トークンが無効または設定されていない

**解決策**:
1. トークンをもう一度確認: `echo $env:GITHUB_TOKEN`
2. トークンが `ghp_` で始まっているか確認
3. トークンの有効期限を確認: https://github.com/settings/tokens
4. 新しいトークンを生成（古いものは削除）

---

### エラー: `403 Forbidden`
```
✗ Failed to create issue: ...
  Error: 403 Client Error: Forbidden
```

**原因**: トークンのスコープが不足

**解決策**:
1. https://github.com/settings/tokens でトークン確認
2. `repo` スコープが ✅ チェックされているか確認
3. 新しいトークンを生成

---

### エラー: `404 Not Found`
```
✗ Failed to create issue: ...
  Error: 404 Client Error: Not Found
```

**原因**: リポジトリが見つからない

**解決策**:
1. `GITHUB_OWNER` が正しいか確認: `Akier-X`
2. `GITHUB_REPO` が正しいか確認: `auto-trade-system`
3. リポジトリが public か確認（private の場合、トークンが必要）

---

### スクリプトが動かない・エラーが出続ける場合

#### 1. デバッグモード実行
```python
# スクリプトの最初に追加
import os
print("Environment variables:")
print(f"  GITHUB_TOKEN: {bool(os.getenv('GITHUB_TOKEN'))}")
print(f"  GITHUB_OWNER: {os.getenv('GITHUB_OWNER', 'Akier-X')}")
print(f"  GITHUB_REPO: {os.getenv('GITHUB_REPO', 'auto-trade-system')}")
```

#### 2. curl でテスト
```bash
# 有効なトークンか確認
curl -H "Authorization: token ghp_xxxxx..." \
  https://api.github.com/repos/Akier-X/auto-trade-system

# 成功すれば、リポジトリ情報が返される
```

#### 3. スクリプトが古い可能性

最新バージョンに更新：
```bash
git pull origin claude/x-post-data-retrieval-EwVYv
```

---

## 代替案: Web UI でマニュアル作成

スクリプトが動かない場合、GitHub Web UI でマニュアルに Issues を作成できます：

1. **リポジトリを開く**
   - https://github.com/Akier-X/auto-trade-system

2. **Issues タブ**
   - リポジトリ → Issues

3. **New issue**
   - タイトル、説明、ラベルを入力
   - Submit new issue

4. **プロジェクトボードに追加**
   - Issue を開く → 右側 "Project" → Project Alpha

これは時間がかかりますが、スクリプトの代替手段として機能します。

---

## 参考資料

- GitHub Docs: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- GitHub API Reference: https://docs.github.com/en/rest
- Project Board Setup: [.github/PROJECT_BOARD.md](.github/PROJECT_BOARD.md)

---

**最終更新**: 2026年2月
