// Chrome拡張のバックグラウンドスクリプト（サービスワーカー）
// content.jsからのメッセージを受け取り、設定に基づいて勤怠データを処理する
// 設定で管理する静的キー一覧
const STATIC_KEYS = [
  "targetPageUrl",
  "enableDirectPost",
  "targetApiUrl",
  "apiKey",
  "openInBackground",
  "autoCloseMs",
  "showNotificationOnSuccess",
  "inKeywords",
  "outKeywords",
  "inSelectors",
  "outSelectors",
  "debounceMs",
  "debug",
];

// 動的既定値（拡張IDに依存するURLなどを含む）
// ランタイムで生成される値を含む初期設定
function getDynamicDefaults() {
  const bridgeUrl = chrome.runtime.getURL("bridge.html"); // ← 拡張IDに依存してもOK
  return {
    targetPageUrl: bridgeUrl,
    enableDirectPost: false,
    targetApiUrl: "",
    apiKey: "",
    openInBackground: true,
    autoCloseMs: 100,
    showNotificationOnSuccess: true,
    inKeywords: [
      "出勤",
      "出社",
      "打刻開始",
      "勤務開始",
      "check in",
      "clock in",
    ],
    outKeywords: [
      "退勤",
      "退社",
      "打刻終了",
      "勤務終了",
      "check out",
      "clock out",
    ],
    inSelectors: [".clock_in .time-stamp-button"],
    outSelectors: [".clock_out .time-stamp-button"],
    debounceMs: 1200,
    debug: true, // ← デフォルトはONに指定
  };
}

// 現在の設定を保持するグローバル変数
let settings = { ...getDynamicDefaults() };

// chrome.storage.syncから設定を読み込み、メモリに保存
async function loadSettings() {
  const dynamic = getDynamicDefaults();
  const saved = await chrome.storage.sync.get(STATIC_KEYS);
  settings = { ...dynamic, ...saved };
}

// 初回インストール時などに、未設定の項目に既定値をセットする
async function seedDefaultsIfMissing() {
  const dynamic = getDynamicDefaults();
  const saved = await chrome.storage.sync.get(STATIC_KEYS);
  const toSet = {};
  for (const k of STATIC_KEYS) {
    if (saved[k] === undefined) toSet[k] = dynamic[k];
  }
  if (Object.keys(toSet).length) await chrome.storage.sync.set(toSet);
}

// デバッグ用のログ出力関数（debug設定がtrueの時のみ表示）
function log(...args) {
  if (settings.debug) console.log("[MF-Bridge]", ...args);
}

// 拡張機能インストール・更新時の初期化処理
chrome.runtime.onInstalled.addListener(async () => {
  await seedDefaultsIfMissing();
  await loadSettings();
});

// Chrome起動時に設定を再読み込み
chrome.runtime.onStartup.addListener(loadSettings);
// 設定変更時のリアルタイム反映
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") loadSettings();
});

// 直接API POSTモード - 設定されたAPIエンドポイントに勤怠データを送信
async function postDirect(payload) {
  const headers = { "Content-Type": "application/json" };
  if (settings.apiKey) headers["Authorization"] = `Bearer ${settings.apiKey}`;
  const res = await fetch(settings.targetApiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    keepalive: true,
  });
  return res.ok;
}

// ブリッジページモード - bridge.htmlをタブで開いて勤怠データを渡す
async function openBridgeTab(payload) {
  const u = new URL(settings.targetPageUrl);
  u.searchParams.set("source", "moneyforward");
  u.searchParams.set("action", payload.action);
  u.searchParams.set("timestamp", payload.timestamp);
  u.searchParams.set("page", payload.pageTitle || "");
  u.searchParams.set("ref", payload.pageUrl || "");

  const tab = await chrome.tabs.create({
    url: u.toString(),
    active: !settings.openInBackground,
  });

  if (settings.autoCloseMs > 0 && settings.openInBackground) {
    setTimeout(() => {
      chrome.tabs.remove(tab.id).catch(() => {});
    }, settings.autoCloseMs);
  }
}

// content.jsからのメッセージを処理するメインハンドラー
// 勤怠イベント（出勤/退勤）を受け取り、設定に応じて処理を分岐
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "MF_BRIDGE_EVENT") return;
  (async () => {
    await loadSettings();
    const { action, timestamp, pageUrl, pageTitle } = msg.payload || {};
    const payload = { action, timestamp, pageUrl, pageTitle };

    let ok = false;
    if (settings.enableDirectPost && settings.targetApiUrl) {
      try {
        ok = await postDirect(payload);
      } catch (e) {
        log("direct post failed:", e);
        ok = false;
      }
    }

    if (!settings.enableDirectPost || !ok) {
      await openBridgeTab(payload);
      ok = true;
    }

    if (ok && settings.showNotificationOnSuccess) {
      chrome.notifications.create(`mf-bridge-${Date.now()}`, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "勤怠記録を送信しました",
        message: `${action === "clock_in" ? "出勤" : "退勤"}：${new Date(
          timestamp
        ).toLocaleString()}`,
        priority: 0,
      });
    }
    sendResponse({ ok });
  })();
  return true; // 非同期でsendResponseを呼び出すためtrueを返す
});
