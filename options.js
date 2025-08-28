// 設定ページ(options.html)のJavaScript
// ユーザーが入力した設定をChromeストレージに保存・読み込み

// 拡張ランタイムに依存する動的な既定値を生成
async function dynamicDefaults(){
  const bridgeUrl = chrome.runtime.getURL("bridge.html");
  return {
    targetPageUrl: bridgeUrl,
    enableDirectPost: false,
    targetApiUrl: "",
    apiKey: "",
    openInBackground: true,
    autoCloseMs: 100,
    showNotificationOnSuccess: true,
    inKeywords: ["出勤","出社","打刻開始","勤務開始"],
    outKeywords:["退勤","退社","打刻終了","勤務終了"],
    inSelectors:  [".clock_in .time-stamp-button"],
    outSelectors: [".clock_out .time-stamp-button"],
    debounceMs: 1200,
    debug: true
  };
}

// 設定を読み込む
async function load() {
  const DEFAULTS = await dynamicDefaults();
  const saved = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  const cfg = { ...DEFAULTS, ...saved };

  // HTML要素に値をセットするヘルパー関数
  const set = (id, val) => document.getElementById(id).value = val ?? "";
  const setChk = (id, val) => document.getElementById(id).checked = !!val;

  set("targetPageUrl", cfg.targetPageUrl);
  setChk("openInBackground", cfg.openInBackground);
  document.getElementById("autoCloseMs").value = cfg.autoCloseMs;

  setChk("enableDirectPost", cfg.enableDirectPost);
  set("targetApiUrl", cfg.targetApiUrl);
  document.getElementById("apiKey").value = cfg.apiKey;

  document.getElementById("inKeywords").value  = (cfg.inKeywords||[]).join("\n");
  document.getElementById("outKeywords").value = (cfg.outKeywords||[]).join("\n");
  document.getElementById("inSelectors").value  = (cfg.inSelectors||[]).join("\n");
  document.getElementById("outSelectors").value = (cfg.outSelectors||[]).join("\n");
  document.getElementById("debounceMs").value = cfg.debounceMs;
  setChk("debug", cfg.debug);
}

// UIから値を収集してChromeストレージに保存
async function save() {
  // HTML要素から値を取得するヘルパー関数
  const get = (id) => document.getElementById(id).value.trim();
  const getList = (id) => get(id).split("\n").map(s => s.trim()).filter(Boolean); // 改行区切りリスト
  const getChk = (id) => document.getElementById(id).checked; // チェックボックスの値

    // フォームから現在の設定値を収集
  const data = {
    targetPageUrl: get("targetPageUrl"),
    openInBackground: getChk("openInBackground"),
    autoCloseMs: Math.max(0, parseInt(get("autoCloseMs") || "0", 10)),
    enableDirectPost: getChk("enableDirectPost"),
    targetApiUrl: get("targetApiUrl"),
    apiKey: get("apiKey"),
    inKeywords: getList("inKeywords"),
    outKeywords: getList("outKeywords"),
    inSelectors: getList("inSelectors"),
    outSelectors: getList("outSelectors"),
    debounceMs: Math.max(0, parseInt(get("debounceMs") || "1200", 10)),
    debug: getChk("debug")
  };

  // 設定をChromeストレージに保存
  await chrome.storage.sync.set(data);
  // 保存完了メッセージを表示
  const s = document.getElementById("status");
  s.textContent = "保存しました";
  setTimeout(() => s.textContent = "", 1200);
}

// ページ読み込み完了時の初期化処理
window.addEventListener("DOMContentLoaded", () => {
  load();
  document.getElementById("save").addEventListener("click", save);
});
