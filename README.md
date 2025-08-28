# MF→自動打刻ブリッジ

MoneyForwardの勤怠システムでの出勤・退勤ボタンのクリックを自動検知し、ユーザーの勤怠管理システムに自動転送するChromeの拡張機能です。

## 📋 機能概要

- **自動検知**: MoneyForwardサイトで出勤・退勤ボタンをクリックしたら自動でイベントを検知
- **柔軟な設定**: キーワードやCSSセレクタで検知条件をカスタマイズ可能
- **2つの連携方式**: 
  - **ブリッジページ経由**: URLパラメータで勤怠データを受け渡し
  - **直接API POST**: 設定したAPIエンドポイントに直接データ送信
- **ローカル記録**: 勤怠ログの保存・表示・CSV出力
- **通知機能**: 記録成功時の通知表示

## 🚀 インストール方法

1. このリポジトリをクローンまたはダウンロード
2. Chrome で `chrome://extensions/` を開く
3. 「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. ダウンロードしたフォルダを選択

## ⚙️ 設定方法

拡張機能のアイコンを右クリック → 「オプション」から設定画面を開けます。

### 基本設定

- **勤怠サイトURL**: ブリッジページのURL（通常は拡張内蔵のbridge.htmlが自動設定）
- **新規タブは非アクティブで開く**: チェックONで背景でタブを開く
- **自動クローズ**: 指定時間（ミリ秒）後に自動でタブを閉じる（0で無効）

### 直接POST設定（オプション）

- **直接POSTを有効化**: チェックONでAPI直接送信モード
- **POST先API URL**: あなたの勤怠APIエンドポイント
- **APIキー**: Bearer認証用のトークン（任意）

### 検知設定

- **出勤/退勤キーワード**: ボタンのテキストから検知するキーワード（改行区切り）
- **出勤/退勤セレクタ**: CSSセレクタでボタンを特定（改行区切り、キーワードより優先）
- **デバウンス**: 重複検知を防ぐ間隔（ミリ秒）

## 🔄 動作の流れ

### 1. MoneyForwardでの操作
```
ユーザーがMoneyForwardで出勤ボタンをクリック
↓
content.jsがクリックイベントを検知
↓
background.jsにメッセージを送信
```

### 2. 勤怠データの処理
```
background.jsがメッセージを受信
↓
設定に応じて処理方法を選択
↓
【ブリッジページモード】OR【直接POSTモード】
```

## 📡 クエリパラメータの詳細

### ブリッジページモードの場合

勤怠ボタンを押下すると、以下のようなURLパラメータでbridge.htmlが開かれます。

#### 出勤時の例
```
chrome-extension://abcdefghijklmnopqrstuvwxyz123456/bridge.html?source=moneyforward&action=clock_in&timestamp=2025-01-15T00:30:00.000Z&page=勤怠管理 - MoneyForward&ref=https://attendance.moneyforward.com/my_page
```

#### 退勤時の例
```
chrome-extension://abcdefghijklmnopqrstuvwxyz123456/bridge.html?source=moneyforward&action=clock_out&timestamp=2025-01-15T09:30:00.000Z&page=勤怠管理 - MoneyForward&ref=https://attendance.moneyforward.com/my_page
```

### クエリパラメータの詳細

| パラメータ | 説明 | 値の例 |
|-----------|------|--------|
| `source` | イベントの発生元 | `moneyforward` |
| `action` | 勤怠アクション | `clock_in` (出勤) / `clock_out` (退勤) |
| `timestamp` | イベント発生日時 (ISO 8601形式) | `2025-01-15T00:30:00.000Z` |
| `page` | ページタイトル | `勤怠管理 - MoneyForward` |
| `ref` | 参照元URL | `https://attendance.moneyforward.com/my_page` |

### 直接POSTモードの場合

設定したAPIエンドポイントに以下のJSON形式でPOSTリクエストが送信されます。

```json
{
  "action": "clock_in",
  "timestamp": "2025-01-15T00:30:00.000Z",
  "pageUrl": "https://attendance.moneyforward.com/my_page",
  "pageTitle": "勤怠管理 - MoneyForward"
}
```

#### リクエストヘッダー
```
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY (APIキー設定時のみ)
```

## 📊 ブリッジページの機能

内蔵のbridge.htmlページでは以下の機能を提供：

- **勤怠イベントの自動記録**: URLパラメータから勤怠データを取得してlocalStorageに保存
- **ログ一覧表示**: 過去の勤怠記録をテーブル形式で表示
- **CSVエクスポート**: 勤怠ログをCSVファイルでダウンロード
- **ダーク/ライトテーマ**: システム設定に応じた自動切り替えまたは手動切り替え
- **API連携**: window.ATTENDANCE_API_URLが設定されている場合は外部APIに送信

## 🛠️ カスタマイズ

### 独自の勤怠システムとの連携

#### 方法1: ブリッジページ経由
1. あなたの勤怠システムで、URLパラメータを受け取るページを作成
2. 拡張機能の設定で「勤怠サイトURL」にそのページのURLを設定

#### 方法2: 直接API POST
1. あなたの勤怠システムでAPI エンドポイントを作成
2. CORS設定で拡張機能のOriginを許可
3. 拡張機能の設定で「直接POST」を有効化し、APIのURLを設定

### 検知条件の調整

MoneyForwardの画面が変更された場合は、設定画面で以下を調整：

- **キーワード**: ボタンに表示されるテキストを追加/変更
- **CSSセレクタ**: より具体的なセレクタを設定（`.time-stamp-button[data-action="clock-in"]`など）

## 📁 ファイル構成

```
mf-attendance-bridge/
├── manifest.json           # Chrome拡張の設定ファイル
├── background.js           # サービスワーカー（メイン処理）
├── content.js             # MoneyForwardページに注入されるスクリプト
├── options.html           # 設定画面のHTML
├── options.js            # 設定画面のJavaScript
├── bridge.html           # 勤怠データ受信ページのHTML
├── bridge.js            # 勤怠データ受信ページのJavaScript
├── package.json         # Node.js設定ファイル
├── fetch-icons.mjs     # アイコン生成スクリプト
└── icons/              # 拡張機能のアイコン
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 🔒 セキュリティについて

この拡張機能は：
- MoneyForwardサイトでのクリック検知のみを行います
- ユーザーの認証情報を直接取り扱いません  
- 設定されたURLへのデータ送信のみを実行します
- すべてのデータはローカル（localStorage）に保存されます

## 🐛 トラブルシューティング

### 勤怠ボタンが検知されない
1. 設定画面でデバッグログを有効にする
2. Chrome Developer Tools のConsoleタブでログを確認
3. キーワードまたはCSSセレクタを調整

### API連携が失敗する
1. CORS設定を確認（Access-Control-Allow-Originの設定）
2. APIエンドポイントのURLが正しいか確認
3. Bearer トークンが正しいか確認

## 📝 ライセンス

ISC License

## 🤝 貢献

バグ報告や機能提案は Issue でお待ちしています。