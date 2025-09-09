# 直接POST機能テストガイド

## 概要
このガイドでは、MF→自動打刻ブリッジの直接POST機能が正しく動作するかテストします。

## テスト環境の準備

### 1. Node.jsがインストールされていることを確認
```bash
node --version
```

### 2. テストサーバーを起動
```bash
# プロジェクトディレクトリで実行
cd C:\mf-attendance-bridge
node test-server.js
```

**期待される出力:**
```
=== 直接POST機能テストサーバー ===
サーバー起動: http://localhost:3000

利用可能なエンドポイント:
  POST http://localhost:3000/api/test-attendance
  GET  http://localhost:3000/api/received-logs
  POST http://localhost:3000/api/clear-logs
  GET  http://localhost:3000/api/health

拡張機能の設定:
  - 直接POSTを有効化: ✓
  - POST 先 API URL: http://localhost:3000/api/test-attendance
  - API キー: test-api-key-12345 (任意)
```

## テスト手順

### ステップ1: 拡張機能の設定

1. Chrome拡張機能の管理画面を開く
2. 「MF→自動打刻ブリッジ」の「オプション」をクリック
3. 以下のように設定:
   - ✓ 直接POSTを有効化
   - POST 先 API URL: `http://localhost:3000/api/test-attendance`
   - API キー: `test-api-key-12345` (任意)
4. 「保存」をクリック

### ステップ2: 実際のMoneyForwardページでテスト

1. MoneyForward勤怠のページ（`https://attendance.moneyforward.com/`）を開く
2. 出勤または退勤ボタンをクリック
3. テストサーバーのコンソール出力を確認

### ステップ3: サーバーログの確認

テストサーバーのコンソールに以下のような出力が表示されるかチェック:

```
[2025-01-XX] POST /api/test-attendance
=== 直接POST受信 ===
時刻: 2025-01-XXX...
Authorization: Bearer test-api-key-12345
Content-Type: application/json
データ: {
  "action": "clock_in",
  "timestamp": "2025-01-XXX...",
  "pageUrl": "https://attendance.moneyforward.com/...",
  "pageTitle": "...",
  "team": "テストチーム",
  "project": "テストプロジェクト"
}
===================
```

## 期待される動作

### 正常な場合:
1. **直接POST有効時**: テストサーバーにPOSTリクエストが送信される
2. **リクエスト内容**: action, timestamp, team, project等が含まれる
3. **認証ヘッダー**: APIキーが`Authorization: Bearer`ヘッダーに含まれる
4. **レスポンス**: JSON形式で成功応答が返る

### エラーケースのテスト:

#### 1. サーバーが停止している場合
- background.jsで`catch`ブロックが実行される
- bridge.htmlが開かれる（フォールバック）

#### 2. APIキーが無効な場合
- サーバーが401応答を返す
- bridge.htmlが開かれる（フォールバック）

#### 3. 直接POSTが無効な場合
- 直接POSTはスキップされる
- bridge.htmlが開かれる

## トラブルシューティング

### テストサーバーが起動しない
```bash
# ポート3000が使用中の場合
netstat -ano | findstr :3000
# プロセスを終了してから再起動
```

### 拡張機能からPOSTが送信されない
1. Chrome Developer Tools → Console でエラーを確認
2. 拡張機能が最新のmanifest.json権限を持っているか確認
3. background.jsのログを確認（`settings.debug = true`に設定）

### CORSエラーが発生する
- テストサーバーは既にCORSを許可しているが、別のポートを試してみる
- Chrome拡張機能のmanifest.jsonで適切な権限が設定されているか確認

## 検証ポイント

✅ **必須チェック項目:**
1. テストサーバーにPOSTリクエストが到達する
2. リクエストボディにaction, timestampが含まれる
3. Authorizationヘッダーが正しく設定される
4. レスポンスが正しく処理される
5. エラー時にbridge.htmlにフォールバックする

✅ **追加チェック項目:**
1. 複数回連続でPOSTしても正常動作する
2. 異なるaction（clock_in, clock_out, project_switch）が正しく送信される
3. チーム・プロジェクト情報が正しく含まれる

## テスト完了後

1. テストサーバーを停止（Ctrl+C）
2. 拡張機能の設定を本番環境用に戻す
3. テストファイルを削除（必要に応じて）

## 結果の記録

- [ ] 出勤POSTが正常に送信された
- [ ] 退勤POSTが正常に送信された  
- [ ] プロジェクト切替POSTが正常に送信された
- [ ] APIキー認証が正しく動作した
- [ ] エラー時のフォールバックが動作した
- [ ] レスポンス処理が正常だった

---

**注意**: このテストは開発環境用です。本番環境では適切なAPIエンドポイントと認証情報を使用してください。