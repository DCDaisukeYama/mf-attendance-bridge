async function dynamicDefaults() {
  const bridgeUrl = chrome.runtime.getURL("bridge.html");
  return {
    targetPageUrl: bridgeUrl,
    enableDirectPost: false,
    targetApiUrl: "",
    apiKey: "",
    openInBackground: true,
    autoCloseMs: 100,
    showNotificationOnSuccess: true,
    inKeywords: ["出勤", "出社", "打刻開始", "勤務開始"],
    outKeywords: ["退勤", "退社", "打刻終了", "勤務終了"],
    inSelectors: [".clock_in .time-stamp-button"],
    outSelectors: [".clock_out .time-stamp-button"],
    debounceMs: 1200,
    debug: true,
    // 追加：スプレッドシート設定
    sheetMode: false,
    spreadsheetUrl: "",
    ssTeam: "所属チーム",
    ssHeaderCache: {}, // { "YYYY年M月": ["PJ1","PJ2",...] }
    sheetWebAppUrl: "",
    sheetToken:
      "AKfycbyRVbsYfuL3bbcLsTXJ9VBXq5SA4EDWVVUPA-eGF_53PfuYWfVdLRFqcpZMIS0kOR3tlg",
  };
}

// ---- ヘルパー：シートID抽出・今月名・B1:R1取得 ----
function extractSheetId(url) {
  const m = String(url || "").match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

function monthSheetName(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}年${m}月`;
}

async function fetchHeaderBR1Csv(ssUrl, sheetName) {
  const id = extractSheetId(ssUrl);
  if (!id) throw new Error("シートIDが見つかりません");

  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    sheetName
  )}&range=B1:R1`;
  const res = await fetch(csvUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const text = (await res.text()).trim();
  // 簡易CSVパース（B1:R1 1行想定／ダブルクォート除去）
  const cols = text
    .split(",")
    .map((s) => s.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
  return cols;
}

// 設定を読み込む（追記：ss* を UI に反映）
async function load() {
  const DEFAULTS = await dynamicDefaults();
  const saved = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  const cfg = { ...DEFAULTS, ...saved };

  const set = (id, val) => (document.getElementById(id).value = val ?? "");
  const setChk = (id, val) => (document.getElementById(id).checked = !!val);

  set("targetPageUrl", cfg.targetPageUrl);
  setChk("openInBackground", cfg.openInBackground);
  document.getElementById("autoCloseMs").value = cfg.autoCloseMs;
  setChk("enableDirectPost", cfg.enableDirectPost);
  set("targetApiUrl", cfg.targetApiUrl);
  document.getElementById("apiKey").value = cfg.apiKey;
  document.getElementById("inKeywords").value = (cfg.inKeywords || []).join(
    "\n"
  );
  document.getElementById("outKeywords").value = (cfg.outKeywords || []).join(
    "\n"
  );
  document.getElementById("inSelectors").value = (cfg.inSelectors || []).join(
    "\n"
  );
  document.getElementById("outSelectors").value = (cfg.outSelectors || []).join(
    "\n"
  );
  document.getElementById("debounceMs").value = cfg.debounceMs;
  setChk("debug", cfg.debug);

  // 追加
  setChk("ssEnabled", cfg.sheetMode);
  set("ssUrl", cfg.spreadsheetUrl);
  set("ssTeam", cfg.ssTeam);
  set("ssWriterUrl", cfg.sheetWebAppUrl);

  // 読み取りテストボタン
  document.getElementById("btnSsFetch").onclick = async () => {
    const status = document.getElementById("ssFetchStatus");
    status.textContent = "読み取り中…";
    try {
      const url = document.getElementById("ssUrl").value.trim();
      const sheet = monthSheetName(new Date());
      const headers = await fetchHeaderBR1Csv(url, sheet);

      const saved2 = await chrome.storage.sync.get(["ssHeaderCache"]);
      const cache = saved2.ssHeaderCache || {};
      cache[sheet] = headers;
      await chrome.storage.sync.set({ ssHeaderCache: cache, sheetHeaders: headers });

      status.textContent = `OK: ${sheet} / ${headers.length}件`;
      setTimeout(() => (status.textContent = ""), 1500);
    } catch (e) {
      status.textContent = `失敗: ${e.message}`;
    }
  };

  // GAS書き込みテストボタン
  document.getElementById("btnGasTest").onclick = async () => {
    const status = document.getElementById("gasTestStatus");
    status.textContent = "テスト中…";
    try {
      const ssUrl = document.getElementById("ssUrl").value.trim();
      const gasUrl = document.getElementById("ssWriterUrl").value.trim();
      let token = '';
      
      if (!ssUrl || !gasUrl) {
        status.textContent = "スプレッドシートURL・WebアプリURLを入力してください";
        return;
      }

      // WebアプリURLからトークンを自動抽出
      if (gasUrl.includes('/macros/s/')) {
        const match = gasUrl.match(/\/macros\/s\/([^\/]+)/);
        if (match) {
          token = match[1];
          console.log("Auto-extracted token from URL:", token);
        }
      }

      if (!token) {
        status.textContent = "正しいWebアプリURLを入力してください";
        return;
      }

      // スプレッドシートIDを抽出
      const id = extractSheetId(ssUrl);
      if (!id) {
        status.textContent = "スプレッドシートIDが取得できません";
        return;
      }

      const today = new Date();
      const sheetName = monthSheetName(today);
      const row = today.getDate() + 1; // A2=1日なので+1

      const testBody = {
        token: token,
        spreadsheetId: id,
        sheetName: sheetName,
        row: row,
        values: [{ col: "B", value: 0.25 }] // テスト用に0.25時間をB列に書き込み
      };

      console.log("GAS Test - Sending request:", testBody);
      
      const res = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testBody)
      });

      console.log("GAS Test - Response status:", res.status);
      
      const responseText = await res.text();
      console.log("GAS Test - Response text:", responseText);
      
      const json = responseText ? JSON.parse(responseText) : {};
      console.log("GAS Test - Parsed response:", json);
      
      if (json.ok) {
        status.textContent = `OK: ${sheetName} ${row}行目のB列に0.25を書き込み`;
      } else {
        status.textContent = `失敗: ${json.error || 'Unknown error'}`;
        console.error("GAS Test - Error details:", json);
        console.error("GAS Test - Full error info:", {
          error: json.error,
          receivedToken: json.receivedToken,
          expectedToken: json.expectedToken,
          fullResponse: json
        });
        
        // より詳細なエラーメッセージを表示
        if (json.error === 'unauthorized') {
          if (json.receivedToken && json.expectedToken) {
            status.textContent = `認証エラー: 送信トークン=${json.receivedToken.substring(0,20)}... 期待トークン=${json.expectedToken.substring(0,20)}...`;
          } else {
            status.textContent = `認証エラー: GAS側のトークン設定を確認してください`;
          }
        }
      }
      
      setTimeout(() => (status.textContent = ""), 3000);
    } catch (e) {
      status.textContent = `エラー: ${e.message}`;
    }
  };
}

// 保存（追記：ss* も保存）
async function save() {
  const get = (id) => document.getElementById(id).value.trim();
  const getList = (id) =>
    get(id)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  const getChk = (id) => document.getElementById(id).checked;

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
    debug: getChk("debug"),
    sheetMode: getChk("ssEnabled"),
    spreadsheetUrl: get("ssUrl"),
    ssTeam: get("ssTeam") || "所属チーム",
    sheetWebAppUrl: get("ssWriterUrl"),
  };

  await chrome.storage.sync.set(data);

  // 有効化＋URLがあれば即時キャッシュ
  if (data.sheetMode && data.spreadsheetUrl) {
    try {
      const sheet = monthSheetName(new Date());
      const headers = await fetchHeaderBR1Csv(data.spreadsheetUrl, sheet);

      const saved2 = await chrome.storage.sync.get(["ssHeaderCache"]);
      const cache = saved2.ssHeaderCache || {};
      cache[sheet] = headers;
      await chrome.storage.sync.set({ ssHeaderCache: cache, sheetHeaders: headers });
    } catch {
      /* 失敗は黙殺（手動テストボタンで再試行可）*/
    }
  }

  const s = document.getElementById("status");
  s.textContent = "保存しました";
  setTimeout(() => (s.textContent = ""), 1200);
}

window.addEventListener("DOMContentLoaded", () => {
  load();
  document.getElementById("save").addEventListener("click", save);
});
