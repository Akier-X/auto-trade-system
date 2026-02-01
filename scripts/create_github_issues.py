#!/usr/bin/env python3
"""
GitHub Issues Automation Script

このスクリプトは .github/project-tasks.json から GitHub Issues を自動生成します。

使用前に以下の設定が必要です：
1. GitHub Personal Access Token を取得
   https://github.com/settings/tokens → "repo" スコープで新規トークン生成

2. 環境変数を設定：
   export GITHUB_TOKEN="your_token_here"
   export GITHUB_OWNER="Akier-X"
   export GITHUB_REPO="auto-trade-system"

3. スクリプト実行：
   python scripts/create_github_issues.py
"""

import json
import os
import sys
import requests
from pathlib import Path

# .env ファイルがあれば読み込む
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv がない場合はスキップ


class GitHubIssueCreator:
    def __init__(self, owner, repo, token):
        self.owner = owner
        self.repo = repo
        self.token = token
        self.base_url = f"https://api.github.com/repos/{owner}/{repo}/issues"
        self.headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json"
        }
        self.created_issues = []

    def load_tasks(self, json_path):
        """JSONファイルからタスクを読み込む"""
        with open(json_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def create_issue(self, title, body, labels=None, assignee=None):
        """GitHub Issue を作成"""
        payload = {
            "title": title,
            "body": body,
        }

        if labels:
            payload["labels"] = labels

        if assignee:
            payload["assignee"] = assignee

        try:
            response = requests.post(self.base_url, headers=self.headers, json=payload)
            response.raise_for_status()

            issue = response.json()
            issue_number = issue['number']
            print(f"✓ Created Issue #{issue_number}: {title}")
            self.created_issues.append(issue_number)
            return issue_number

        except requests.exceptions.RequestException as e:
            error_msg = str(e)
            print(f"✗ Failed to create issue: {title}")
            print(f"  Error: {error_msg}")

            # 詳細なエラー解析
            if "401" in error_msg:
                print("  💡 Hint: Invalid or expired token. Check GITHUB_TOKEN value.")
            elif "403" in error_msg:
                print("  💡 Hint: Token doesn't have required permissions (repo scope needed).")
            elif "404" in error_msg:
                print("  💡 Hint: Repository not found. Check GITHUB_OWNER and GITHUB_REPO.")
            elif "422" in error_msg:
                print("  💡 Hint: Invalid payload or duplicate issue.")

            return None

    def create_phase_issues(self, data):
        """ROADMAPの各Phaseをissueとして作成"""
        print("\n" + "="*70)
        print("Creating Phase Issues...")
        print("="*70 + "\n")

        for phase in data['phases']:
            phase_title = f"[{phase['phase_name']}] {phase['duration']}"
            phase_body = self._build_phase_body(phase)

            self.create_issue(
                title=phase_title,
                body=phase_body,
                labels=["phase", f"priority-{phase['priority']}"]
            )

    def create_task_issues(self, data):
        """各タスクをissueとして作成"""
        print("\n" + "="*70)
        print("Creating Task Issues...")
        print("="*70 + "\n")

        for phase in data['phases']:
            for task in phase['tasks']:
                task_title = f"[{phase['phase_name']}] {task['title']}"
                task_body = self._build_task_body(task, phase)

                labels = task['labels'] + [f"phase-{phase['phase_id']}"]

                self.create_issue(
                    title=task_title,
                    body=task_body,
                    labels=labels
                )

    def _build_phase_body(self, phase):
        """Phaseのissueボディを生成"""
        task_count = len(phase['tasks'])
        est_hours = sum(task['estimated_hours'] for task in phase['tasks'])

        body = f"""## Phase {phase['phase_id']}: {phase['phase_name']}

**Duration:** {phase['duration']}
**Priority:** {phase['priority'].upper()}
**Status:** {phase['status'].upper()}

### Summary
This phase includes {task_count} tasks with an estimated {est_hours} hours of work.

### Tasks
"""

        for task in phase['tasks']:
            body += f"- [ ] **{task['title']}** ({task['estimated_hours']}h)\n"
            body += f"  - {task['description']}\n"

        body += f"""

### Documentation
- See [ROADMAP.md](../../ROADMAP.md#{phase['phase_id']}) for detailed implementation plan
- See [Database Design](../../docs/database_design.md) for schema information

### Acceptance Criteria
All sub-tasks must be completed and tested before marking this phase as done.
"""

        return body

    def _build_task_body(self, task, phase):
        """タスクのissueボディを生成"""
        body = f"""## Task: {task['title']}

**Estimated Hours:** {task['estimated_hours']}h
**Phase:** Phase {phase['phase_id']} - {phase['phase_name']}
**Duration:** {phase['duration']}

### Description
{task['description']}

### Acceptance Criteria
"""

        for criterion in task['acceptance_criteria']:
            body += f"- [ ] {criterion}\n"

        body += f"""

### Related Documentation
- [ROADMAP.md](../../ROADMAP.md)
- [Database Design](../../docs/database_design.md)
- [System Architecture](../../docs/system_architecture.md)

### Implementation Checklist
- [ ] Code written
- [ ] Tests written
- [ ] Code review completed
- [ ] Merged to main branch
- [ ] Deployment completed

### Notes
Leave comments here with progress updates and blockers.
"""

        return body

    def create_database_issues(self, data):
        """データベーステーブルに関するissueを作成"""
        print("\n" + "="*70)
        print("Creating Database Table Issues...")
        print("="*70 + "\n")

        for table in data['database_tables']:
            table_title = f"[Database] Create table: {table['table_name']}"
            table_body = self._build_table_body(table)

            importance_level = table['importance']
            labels = ["database", "table", f"importance-{importance_level}"]

            self.create_issue(
                title=table_title,
                body=table_body,
                labels=labels
            )

    def _build_table_body(self, table):
        """テーブルのissueボディを生成"""
        body = f"""## Table: {table['table_name']}

**ID:** {table['table_id']}
**Purpose:** {table['purpose']}
**Record Growth Rate:** {table['record_growth'].upper()}
**Importance:** {'⭐' * table['importance']} ({table['importance']}/5)

### Description
Create PostgreSQL table for {table['purpose']}.

### Columns
| Name | Type | Primary Key |
|------|------|-------------|
"""

        for col in table['columns']:
            pk_mark = "✓" if col['pk'] else ""
            body += f"| {col['name']} | {col['type']} | {pk_mark} |\n"

        body += f"""

### Implementation Details
- See [Database Design](../../docs/database_design.md) for full schema specification
- Includes indexes, constraints, and foreign key relationships
- Vector type (pgvector) needed for embedding columns

### Acceptance Criteria
- [ ] Table created successfully
- [ ] All columns defined with correct types
- [ ] Primary key constraint applied
- [ ] Foreign key relationships configured
- [ ] Indexes created for performance
- [ ] Data types optimized for queries
- [ ] Documentation updated

### Example DDL
See [src/storage/queries.sql](../../src/storage/queries.sql) for complete DDL statements.
"""

        return body

    def print_summary(self):
        """作成されたIssueのサマリーを表示"""
        print("\n" + "="*70)
        print("SUMMARY")
        print("="*70)
        print(f"\nTotal Issues Created: {len(self.created_issues)}")

        if self.created_issues:
            print(f"Issue Numbers: {', '.join(f'#{i}' for i in self.created_issues)}")
            print(f"\nView all issues: https://github.com/{self.owner}/{self.repo}/issues")
        else:
            print("No issues were created.")

        print("\n" + "="*70 + "\n")


def main():
    # 環境変数取得
    token = os.getenv('GITHUB_TOKEN')
    owner = os.getenv('GITHUB_OWNER', 'Akier-X')
    repo = os.getenv('GITHUB_REPO', 'auto-trade-system')

    # デバッグ情報表示
    print("="*70)
    print("DEBUG INFORMATION")
    print("="*70)
    print(f"Owner: {owner}")
    print(f"Repository: {repo}")
    print(f"Token set: {bool(token)}")
    if token:
        print(f"Token preview: {token[:10]}...{token[-10:]}")
    print("="*70 + "\n")

    if not token:
        print("ERROR: GITHUB_TOKEN environment variable not set")
        print("\n【Windows ユーザーの設定方法】")
        print("\n1. Personal Access Token を生成:")
        print("   https://github.com/settings/tokens")
        print("   → 「Generate new token (classic)」をクリック")
        print("   → Scopeで「repo」を選択")
        print("   → 「Generate token」")
        print("   → トークンをコピー（表示されるのは1度だけ！）")
        print("\n2. 環境変数を設定（PowerShell）:")
        print("   $env:GITHUB_TOKEN='ghp_xxxxx...'")
        print("   (Windows + R → cmd → setx GITHUB_TOKEN \"ghp_xxxxx...\" でも可)")
        print("\n3. スクリプト再実行:")
        print("   python scripts/create_github_issues.py")
        print("\n4. トークンが正しく設定されたか確認:")
        print("   python -c \"import os; print('Token set:', bool(os.getenv('GITHUB_TOKEN')))\"")
        sys.exit(1)

    # JSONファイルのパス
    script_dir = Path(__file__).parent
    json_path = script_dir.parent / '.github' / 'project-tasks.json'

    if not json_path.exists():
        print(f"ERROR: {json_path} not found")
        sys.exit(1)

    # Creator インスタンス作成
    creator = GitHubIssueCreator(owner, repo, token)

    # データを読み込み
    print(f"Loading tasks from {json_path}...")
    data = creator.load_tasks(json_path)

    # Issue作成
    creator.create_phase_issues(data)
    creator.create_task_issues(data)
    creator.create_database_issues(data)

    # サマリー表示
    creator.print_summary()


if __name__ == '__main__':
    main()
