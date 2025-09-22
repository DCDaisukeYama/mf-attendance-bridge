async function dynamicDefaults() {
  const bridgeUrl = chrome.runtime.getURL("bridge.html");
  
  // Storageから秘密情報を読み込み
  let secrets = {};
  try {
    if (typeof loadSecrets !== 'undefined') {
      secrets = await loadSecrets();
    }
  } catch (error) {
    console.warn('秘密情報の読み込みに失敗しました:', error);
    secrets = {};
  }
  
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
    memberSpreadsheetUrl: "", // メンバー情報用スプレッドシート
    ssTeam: "所属チーム",
    ssHeaderCache: {}, // { "YYYY年M月": ["PJ1","PJ2",...] }
    sheetWebAppUrl: "",
    // SHEET_TOKENは不要 - WebアプリURLから自動抽出されます
    // プロジェクト内容保存用
    projectContents: {}, // { "プロジェクト名": "MarkDown内容" }
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

// MarkDown to HTML変換
function markdownToHtml(md) {
  if (!md) return "";
  md = md.replace(/\r\n?/g, "\n").trim();

  // インライン
  md = md
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  // 見出し
  md = md
    .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // リスト（連続する "- " 行のブロックだけを <ul> に包む）
  md = md.replace(/(^|\n)(-\s+.+(?:\n-\s+.+)*)/g, (_, lead, block) => {
    const items = block
      .trim()
      .split("\n")
      .map(line => line.replace(/^\-\s+(.+)$/, "<li>$1</li>"))
      .join("");
    return `${lead}<ul>${items}</ul>`;
  });

  // 段落処理：空行（2つ以上の改行）で分割してブロックを作成
  const blocks = md.split(/\n{2,}/).map(block => {
    block = block.trim();
    if (!block) return "";
    
    // 既にHTML要素の場合はそのまま返す
    if (/^<(h[1-3]|ul|ol|li|div|p)\b/i.test(block)) {
      return block;
    }
    
    // 通常のテキストブロック：単一改行を<br>に変換して段落でラップ
    return `<p>${block.replace(/\n/g, "<br>")}</p>`;
  });

  return blocks.filter(block => block).join("\n\n");
}

// プロジェクト選択肢を更新
function updateProjectContentOptions() {
  const select = document.getElementById('projectContentSelect');
  const saved = chrome.storage.sync.get(['ssHeaderCache', 'sheetHeaders']);
  
  saved.then(data => {
    const headers = data.sheetHeaders || [];
    
    // 既存のオプションを削除（最初の「選択してください」以外）
    while (select.children.length > 1) {
      select.removeChild(select.lastChild);
    }
    
    // ヘッダーからオプションを追加
    headers.forEach(header => {
      if (header.trim()) {
        const option = document.createElement('option');
        option.value = header;
        option.textContent = header;
        select.appendChild(option);
      }
    });
  });
}

// プロジェクト内容を保存
async function saveProjectContent() {
  const projectName = document.getElementById('projectContentSelect').value;
  const content = document.getElementById('projectContentInput').value;
  const status = document.getElementById('projectContentStatus');
  
  if (!projectName) {
    status.textContent = 'プロジェクトを選択してください';
    setTimeout(() => status.textContent = '', 2000);
    return;
  }
  
  try {
    const saved = await chrome.storage.sync.get(['projectContents']);
    const contents = saved.projectContents || {};
    contents[projectName] = content;
    
    await chrome.storage.sync.set({ projectContents: contents });
    
    status.textContent = '保存しました';
    setTimeout(() => status.textContent = '', 2000);
  } catch (error) {
    status.textContent = '保存に失敗しました';
    console.error('Save error:', error);
  }
}

// プロジェクト内容をプレビュー
function previewProjectContent() {
  const content = document.getElementById('projectContentInput').value;
  const preview = document.getElementById('projectContentPreview');
  const previewContent = document.getElementById('projectContentPreviewContent');
  
  if (!content.trim()) {
    preview.style.display = 'none';
    return;
  }
  
  previewContent.innerHTML = markdownToHtml(content);
  preview.style.display = 'block';
}

// プロジェクト選択時に内容を読み込み
async function loadProjectContent() {
  const projectName = document.getElementById('projectContentSelect').value;
  const input = document.getElementById('projectContentInput');
  const preview = document.getElementById('projectContentPreview');
  
  if (!projectName) {
    input.value = '';
    preview.style.display = 'none';
    return;
  }
  
  try {
    const saved = await chrome.storage.sync.get(['projectContents']);
    const contents = saved.projectContents || {};
    input.value = contents[projectName] || '';
    
    // プレビューも更新
    if (input.value.trim()) {
      previewProjectContent();
    } else {
      preview.style.display = 'none';
    }
  } catch (error) {
    console.error('Load error:', error);
  }
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
  set("memberSpreadsheetUrl", cfg.memberSpreadsheetUrl);
  set("ssTeam", cfg.ssTeam);
  set("ssWriterUrl", cfg.sheetWebAppUrl);

  // プロジェクト内容設定エリアの初期化
  updateProjectContentOptions();

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
      
      // プロジェクト選択肢を更新
      updateProjectContentOptions();
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
    memberSpreadsheetUrl: get("memberSpreadsheetUrl"),
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
      
      // プロジェクト選択肢を更新
      updateProjectContentOptions();
    } catch {
      /* 失敗は黙殺（手動テストボタンで再試行可）*/
    }
  }

  const s = document.getElementById("status");
  s.textContent = "保存しました";
  setTimeout(() => (s.textContent = ""), 1200);
}

// 通知テスト関数
// 出社前通知のテストを行う
async function testPreWorkNotification() {
  const notificationTestStatus = document.getElementById("notificationTestStatus");
  
  try {
    notificationTestStatus.textContent = "出社前通知をテスト中...";
    
    // 設定から出社前通知の分数を取得
    const settings = await chrome.storage.sync.get(['preWorkNotifyMin']);
    const minBefore = settings.preWorkNotifyMin || 15;
    
    // テスト通知を作成
    await chrome.notifications.create(`TEST_PRE_WORK_${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '【テスト】出勤時間のお知らせ',
      message: `${minBefore}分後に出社時刻です。出勤の準備をお忘れなく！（これはテスト通知です）`,
      buttons: [
        { title: 'MoneyForwardを開く' },
        { title: '後で通知' }
      ]
    });
    
    notificationTestStatus.textContent = "出社前通知のテストが完了しました";
    setTimeout(() => {
      notificationTestStatus.textContent = "";
    }, 3000);
    
  } catch (error) {
    console.error("出社前通知テストでエラーが発生しました:", error);
    notificationTestStatus.textContent = "テストでエラーが発生しました";
    setTimeout(() => {
      notificationTestStatus.textContent = "";
    }, 3000);
  }
}

// 退社通知のテストを行う  
async function testWorkEndNotification() {
  const notificationTestStatus = document.getElementById("notificationTestStatus");
  
  try {
    notificationTestStatus.textContent = "退社通知をテスト中...";
    
    // テスト通知を作成
    await chrome.notifications.create(`TEST_WORK_END_${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '【テスト】退社時間のお知らせ',
      message: '退社時刻になりました。お疲れさまでした！（これはテスト通知です）',
      buttons: [
        { title: 'MoneyForwardを開く' },
        { title: 'スヌーズ' }
      ]
    });
    
    notificationTestStatus.textContent = "退社通知のテストが完了しました";
    setTimeout(() => {
      notificationTestStatus.textContent = "";
    }, 3000);
    
  } catch (error) {
    console.error("退社通知テストでエラーが発生しました:", error);
    notificationTestStatus.textContent = "テストでエラーが発生しました";
    setTimeout(() => {
      notificationTestStatus.textContent = "";
    }, 3000);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  load();  // 保存済み設定をUIに設定
  document.getElementById("save").addEventListener("click", save); // 保存ボタンのイベントリスナー
  
  // 通知テストボタンのイベントリスナー追加
  document.getElementById("testPreWorkNotification")?.addEventListener("click", testPreWorkNotification);
  document.getElementById("testWorkEndNotification")?.addEventListener("click", testWorkEndNotification);
  
  // プロジェクト内容関連のイベントリスナー追加
  document.getElementById("projectContentSelect")?.addEventListener("change", loadProjectContent);
  document.getElementById("saveProjectContent")?.addEventListener("click", saveProjectContent);
  document.getElementById("previewProjectContent")?.addEventListener("click", previewProjectContent);
});

// 設定ページの機能すべてが上記の関数で実装されています
// - dynamicDefaults(): デフォルト設定の生成
// - extractSheetId(), monthSheetName(), fetchHeaderBR1Csv(): スプレッドシート操作
// - load(): 保存済み設定のUIへの反映とテストボタンのイベント設定
// - save(): UIからの設定収集とストレージへの保存
// - testPreWorkNotification(), testWorkEndNotification(): 通知テスト機能
