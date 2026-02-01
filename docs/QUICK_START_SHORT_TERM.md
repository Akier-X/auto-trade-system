# 短期トレードシステム クイックスタート

## 5分でセットアップ

### 1. 前提条件の確認

```bash
# Pythonバージョン確認 (3.11以上)
python --version

# PostgreSQL確認
psql --version

# 仮想環境作成 (未作成の場合)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

### 2. 依存パッケージインストール

```bash
# 必須パッケージ
pip install -r requirements.txt

# 追加パッケージ (短期トレード用)
pip install yfinance ta-lib pandas numpy scipy streamlit plotly
```

### 3. データベースセットアップ

```bash
# 基本テーブル作成 (未実施の場合)
python scripts/setup_database.py

# 短期トレード用テーブル作成
python scripts/setup_short_term_tables.py
```

### 4. 環境変数設定

```bash
# .envファイルをコピー
cp .env.example .env

# .envを編集して以下を設定
# - データベース接続情報
# - APIキー
# - SHORT_TERM_ALLOCATION=0.3 (資本の30%を短期トレードに配分)
```

### 5. 価格データ取得

```bash
# 監視銘柄の価格データ取得 (過去90日分)
python scripts/fetch_price_data.py --days 90
```

### 6. テスト実行

```bash
# ドライランモードで1サイクル実行
python src/short_term_main.py --once --dry-run
```

### 7. ダッシュボード確認

```bash
# ダッシュボード起動
streamlit run src/short_term_dashboard.py
```

ブラウザで `http://localhost:8501` を開く

## 実行モード

### ドライランモード (推奨)

```bash
# 実際の取引なし、シミュレーションのみ
python src/short_term_main.py --dry-run --interval 15
```

### シングルサイクル実行

```bash
# 1回だけ実行してテスト
python src/short_term_main.py --once
```

### 継続実行 (本番)

```bash
# 15分間隔で継続実行
python src/short_term_main.py --interval 15
```

## チェックリスト

- [ ] PostgreSQLが起動している
- [ ] データベースとテーブルが作成済み
- [ ] `.env`ファイルが設定済み
- [ ] 価格データが取得済み
- [ ] 監視銘柄が登録済み
- [ ] ドライランモードで動作確認済み

## トラブルシューティング

### エラー: "No module named 'yfinance'"

```bash
pip install yfinance
```

### エラー: "price_history table does not exist"

```bash
python scripts/setup_short_term_tables.py
```

### エラー: "No monitored tickers found"

```bash
# 監視銘柄を登録
python scripts/import_stocks_master.py
```

## 次のステップ

1. [完全ガイドを読む](SHORT_TERM_TRADING_GUIDE.md)
2. パラメータを調整してバックテスト
3. 少額資本で本番運用開始
4. パフォーマンスモニタリング

## サポート

- ログ確認: `logs/short_term_system.log`
- GitHub Issues: 問題報告・質問
- ドキュメント: `docs/` ディレクトリ
