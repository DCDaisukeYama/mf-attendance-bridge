// ===== popup.js =====
// Chrome拡張機能のポップアップページメインスクリプト
// プロジェクト切り替え、勤怠管理、スプレッドシート連携機能を提供

// ローカルストレージで使用するキー定数
const KEY = {
  TEAMS: "teams",                // チーム一覧データ
  ACTIVE_TEAM: "activeTeamId",   // 現在アクティブなチームID
  ACTIVE_PROJ: "activeProjectId", // 現在アクティブなプロジェクトID
  BREAK_START: "breakStart",     // 休憩開始時刻
  BREAK_END: "breakEnd",         // 休憩終了時刻
  WORK_START: "workStart",       // 出社時刻
  WORK_END: "workEnd",           // 退社時刻
  ENABLE_NOTIFICATIONS: "enableNotifications", // 通知機能有効フラグ
  ENABLE_PRE_WORK_NOTIFICATION: "enablePreWorkNotification", // 出社前通知有効フラグ
  ENABLE_WORK_END_NOTIFICATION: "enableWorkEndNotification", // 退社通知有効フラグ
  PRE_WORK_NOTIFY_MIN: "preWorkNotifyMin",     // 出社前通知（分前）
  ENABLE_WORK_DAYS: "enableWorkDays",         // 平日のみ通知フラグ
};

// デフォルトデータ生成関数
// 初回起動時に使用される基本的なチーム・プロジェクト構成
function defaultData() {
  const tid = crypto.randomUUID(); // チームIDをランダム生成
  const pid = crypto.randomUUID(); // プロジェクトIDをランダム生成
  return {
    teams: [
      {
        id: tid,
        name: "所属チーム",
        projects: [{ id: pid, name: "所属プロジェクト" }],
      },
    ],
    activeTeamId: tid,
    activeProjectId: pid,
    breakStart: "13:00",          // デフォルト休憩開始時刻
    breakEnd: "14:00",            // デフォルト休憩終了時刻
    workStart: "10:00",           // デフォルト出社時刻
    workEnd: "19:00",             // デフォルト退社時刻
    enableNotifications: false,   // 通知機能デフォルト無効
    enablePreWorkNotification: true,  // 出社前通知デフォルト有効
    enableWorkEndNotification: true,  // 退社通知デフォルト有効
    preWorkNotifyMin: 15,         // 出社前通知デフォルト15分前
    enableWorkDays: true,         // 平日のみ通知デフォルト有効
  };
}

// 全設定データ読み込み関数
// Chrome同期ストレージからチーム・プロジェクト・休憩設定・出社時間設定を取得
async function loadAll() {
  const saved = await chrome.storage.sync.get([
    KEY.TEAMS,
    KEY.ACTIVE_TEAM,
    KEY.ACTIVE_PROJ,
    KEY.BREAK_START,
    KEY.BREAK_END,
    KEY.WORK_START,
    KEY.WORK_END,
    KEY.ENABLE_NOTIFICATIONS,
    KEY.ENABLE_PRE_WORK_NOTIFICATION,
    KEY.ENABLE_WORK_END_NOTIFICATION,
    KEY.PRE_WORK_NOTIFY_MIN,
    KEY.ENABLE_WORK_DAYS,
  ]);
  
  // データが存在しない場合はデフォルトデータを作成・保存
  if (!saved.teams || !Array.isArray(saved.teams) || saved.teams.length === 0) {
    const def = defaultData();
    await chrome.storage.sync.set(def);
    return def;
  }
  
  // 保存されたデータを返却（デフォルト値でフォールバック）
  return {
    teams: saved.teams,
    activeTeamId: saved.activeTeamId,
    activeProjectId: saved.activeProjectId,
    breakStart: saved.breakStart || "13:00",
    breakEnd: saved.breakEnd || "14:00",
    workStart: saved.workStart || "10:00",
    workEnd: saved.workEnd || "19:00",
    enableNotifications: saved.enableNotifications || false,
    enablePreWorkNotification: saved.enablePreWorkNotification !== undefined ? saved.enablePreWorkNotification : true,
    enableWorkEndNotification: saved.enableWorkEndNotification !== undefined ? saved.enableWorkEndNotification : true,
    preWorkNotifyMin: saved.preWorkNotifyMin || 15,
    enableWorkDays: saved.enableWorkDays !== undefined ? saved.enableWorkDays : true,
  };
}

// 全設定データ保存関数
// 変更されたデータをChrome同期ストレージに保存
async function saveAll(data) {
  await chrome.storage.sync.set({
    [KEY.TEAMS]: data.teams,
    [KEY.ACTIVE_TEAM]: data.activeTeamId,
    [KEY.ACTIVE_PROJ]: data.activeProjectId,
    [KEY.BREAK_START]: data.breakStart,
    [KEY.BREAK_END]: data.breakEnd,
    [KEY.WORK_START]: data.workStart,
    [KEY.WORK_END]: data.workEnd,
    [KEY.ENABLE_NOTIFICATIONS]: data.enableNotifications,
    [KEY.ENABLE_PRE_WORK_NOTIFICATION]: data.enablePreWorkNotification,
    [KEY.ENABLE_WORK_END_NOTIFICATION]: data.enableWorkEndNotification,
    [KEY.PRE_WORK_NOTIFY_MIN]: data.preWorkNotifyMin,
    [KEY.ENABLE_WORK_DAYS]: data.enableWorkDays,
  });
}

// アクティブなチーム・プロジェクト検索関数
// 指定されたIDに基づいて現在選択中のチームとプロジェクトを取得
function findActive(teams, tid, pid) {
  const t = teams.find((x) => x.id === tid) || teams[0]; // チームが見つからない場合は最初のチームを使用
  const p = t?.projects?.find((x) => x.id === pid) || t?.projects?.[0]; // プロジェクトが見つからない場合は最初のプロジェクトを使用
  return { team: t, project: p };
}

// 通知詳細設定の有効/無効を切り替える関数
// enabledがfalseの場合、詳細設定をグレーアウトし操作不可にする
function toggleNotificationSettings(enabled) {
  const detailsContainer = document.getElementById("notificationDetailsContainer");
  const advancedContainer = document.getElementById("notificationAdvancedContainer");
  
  if (enabled) {
    detailsContainer?.classList.remove("notification-settings-disabled");
    advancedContainer?.classList.remove("notification-settings-disabled");
  } else {
    detailsContainer?.classList.add("notification-settings-disabled");
    advancedContainer?.classList.add("notification-settings-disabled");
  }
}

// チーム存在確認・作成関数
// 指定された名前のチームが存在しない場合は自動作成
function ensureTeam(data, name) {
  let t = data.teams.find((x) => x.name === name);
  if (!t) {
    t = { id: crypto.randomUUID(), name, projects: [] };
    data.teams.push(t);
  }
  return t;
}

// プロジェクト存在確認・作成関数  
// 指定されたチーム内に指定名のプロジェクトが存在しない場合は自動作成
function ensureProject(team, pjName) {
  let p = team.projects.find((x) => x.name === pjName);
  if (!p) {
    p = { id: crypto.randomUUID(), name: pjName };
    team.projects.push(p);
  }
  return p;
}

// ===== Googleスプレッドシート連携ヘルパー関数群 =====

// スプレッドシートURLからシートIDを抽出
function extractSheetId(url) {
  const m = String(url || "").match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

// 現在の年月に基づいたシート名生成（例："2025年1月"）
function monthSheetName(d = new Date()) {
  const y = d.getFullYear(),
    m = d.getMonth() + 1;
  return `${y}年${m}月`;
}

// スプレッドシートのヘッダー行（B1:R1）をCSV形式で取得
// プロジェクト名一覧の自動読み込みに使用
async function fetchHeaderBR1Csv(ssUrl, sheetName) {
  const id = extractSheetId(ssUrl);
  if (!id) return [];
  
  // GoogleスプレッドシートのCSVエクスポートAPIを使用
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    sheetName
  )}&range=B1:R1`;
  
  const res = await fetch(csvUrl);
  if (!res.ok) return [];
  
  const text = (await res.text()).trim();
  // 簡易CSVパースでヘッダー項目を配列として返却
  return text
    .split(",")
    .map((s) => s.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}

// ===== UI構築ヘルパー関数群 =====

// チーム選択セレクトボックスの内容更新
// チーム一覧をHTMLのoptionタグとして追加
function fillTeamSelect(sel, teams, selectedId) {
  sel.innerHTML = "";
  for (const t of teams) {
    const opt = new Option(t.name, t.id, false, t.id === selectedId);
    sel.add(opt);
  }
}

// プロジェクト選択セレクトボックスの内容更新
// 指定チーム内のプロジェクト一覧をoptionタグとして追加
function fillProjectSelect(sel, team, selectedPid) {
  sel.innerHTML = "";
  (team?.projects || []).forEach((p) => {
    sel.add(new Option(p.name, p.id, false, p.id === selectedPid));
  });
}

// ===== カスタムセレクトボックス関連ヘルパー関数群 =====

// カスタムドロップダウンメニューの生成（未使用だが将来的な拡張用）
function createCustomDropdown(options, selectedValue, onSelect, iconText = "•") {
  const dropdown = document.createElement("div");
  dropdown.className = "select-dropdown";
  
  options.forEach((option) => {
    const optionEl = document.createElement("div");
    optionEl.className = `select-option ${option.value === selectedValue ? "selected" : ""}`;
    optionEl.innerHTML = `
      <div class="select-icon">${iconText}</div>
      <span>${option.text}</span>
    `;
    optionEl.addEventListener("click", () => {
      onSelect(option.value, option.text);
      dropdown.classList.remove("show");
    });
    dropdown.appendChild(optionEl);
  });
  
  return dropdown;
}

// グローバル変数：カスタムセレクトのイベントリスナー初期化フラグ
let customSelectsInitialized = false;

// カスタムセレクトボックスの初期化関数
// 表示テキストの更新、ドロップダウンオプションの生成、イベントハンドラーの設定
function initCustomSelect(customSelect, dropdown, displayText, options, selectedValue, onSelect, iconText = "•") {
  // 選択状態の表示を更新
  const displayEl = customSelect.querySelector("span");
  const selectedOption = options.find(opt => opt.value === selectedValue);
  displayEl.textContent = selectedOption ? selectedOption.text : "選択してください";
  
  // ドロップダウンメニューを構築
  dropdown.innerHTML = "";
  options.forEach((option) => {
    const optionEl = document.createElement("div");
    optionEl.className = `select-option ${option.value === selectedValue ? "selected" : ""}`;
    optionEl.innerHTML = `
      <div class="select-icon">${iconText}</div>
      <span>${option.text}</span>
    `;
    // オプション選択時のイベントハンドラー
    optionEl.addEventListener("click", (e) => {
      e.stopPropagation();
      displayEl.textContent = option.text;
      dropdown.classList.remove("show");
      customSelect.classList.remove("open");
      onSelect(option.value, option.text);
    });
    dropdown.appendChild(optionEl);
  });
}

// カスタムセレクトのグローバルイベントリスナー設定
// 重複登録を防ぐため一度だけ実行される
function setupCustomSelectEventListeners() {
  if (customSelectsInitialized) return;
  customSelectsInitialized = true;

  // ページ全体のクリックイベントでドロップダウンを閉じる
  // カスタムセレクト以外をクリックした場合に全てのドロップダウンを非表示にする
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-select") && !e.target.closest(".select-dropdown")) {
      document.querySelectorAll(".select-dropdown").forEach(dd => dd.classList.remove("show"));
      document.querySelectorAll(".custom-select").forEach(cs => cs.classList.remove("open"));
    }
  });
}
// アクティブプロジェクト表示の更新
// 現在選択中のチーム/プロジェクト名をUIに反映し、プロジェクト内容も表示
async function updateActiveLabel(el, data) {
  const { team, project } = findActive(
    data.teams,
    data.activeTeamId,
    data.activeProjectId
  );
  el.textContent =
    team && project ? `${team.name} / ${project.name}` : "未選択";
  
  // プロジェクト内容も表示
  if (project) {
    await displayProjectContent(project.name);
  } else {
    await displayProjectContent(null);
  }
}

// プロジェクト切り替えイベントの送信
// バックグラウンドスクリプトにプロジェクト変更を通知し、勤怠システムと連携
function sendProjectSwitch(teamName, projName) {
  const payload = {
    action: "project_switch",
    timestamp: new Date().toISOString(),
    pageUrl: location.href,
    pageTitle: "プロジェクト切替",
    team: teamName,
    project: projName,
  };
  chrome.runtime.sendMessage({ type: "MF_BRIDGE_EVENT", payload });
}

// MarkDown to HTML変換（popup用シンプル版）
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

// プロジェクト内容を表示する関数
async function displayProjectContent(projectName) {
  const contentCard = document.getElementById('projectContentCard');
  const contentDisplay = document.getElementById('projectContentDisplay');
  
  if (!projectName) {
    contentCard.style.display = 'none';
    return;
  }
  
  try {
    // プロジェクト内容を取得
    const saved = await chrome.storage.sync.get(['projectContents']);
    const contents = saved.projectContents || {};
    const content = contents[projectName];
    
    if (content && content.trim()) {
      // 内容がある場合は表示
      contentDisplay.innerHTML = markdownToHtml(content);
      contentCard.style.display = 'block';
    } else {
      // 内容がない場合は非表示
      contentCard.style.display = 'none';
    }
  } catch (error) {
    console.error('プロジェクト内容の読み込みエラー:', error);
    contentCard.style.display = 'none';
  }
}

// ===== 勤怠ステータス管理関数群 =====

// 勤怠ログから現在の出勤状態を判定
// 出勤中/休憩中/退勤の判定と休憩時間の自動考慮
function getAttendanceStatus(logs, breakStart, breakEnd) {
  // ログが存在しない場合は未出勤
  if (!logs || logs.length === 0) {
    return { status: "off", text: "未出勤", showShortcut: true };
  }

  // ログを時系列順にソートして最新のログを取得
  const sortedLogs = [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const latestLog = sortedLogs[sortedLogs.length - 1];

  // 現在時刻の取得（HH:MM形式）
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 現在が休憩時間内かどうかの判定
  const isBreakTime = breakStart && breakEnd && currentTime >= breakStart && currentTime <= breakEnd;

  // 最新ログのアクションに基づく状態判定
  if (latestLog.action === "clock_in") {
    if (isBreakTime) {
      return { status: "break", text: "休憩", showShortcut: false };
    }
    return { status: "working", text: "出勤中", showShortcut: false };
  } else if (latestLog.action === "clock_out") {
    return { status: "off", text: "退勤", showShortcut: true };
  } else {
    // プロジェクト切替の場合、直前の出退勤ログを検索
    for (let i = sortedLogs.length - 2; i >= 0; i--) {
      const prevLog = sortedLogs[i];
      if (prevLog.action === "clock_in" || prevLog.action === "clock_out") {
        if (prevLog.action === "clock_in") {
          if (isBreakTime) {
            return { status: "break", text: "休憩", showShortcut: false };
          }
          return { status: "working", text: "出勤中", showShortcut: false };
        } else {
          return { status: "off", text: "退勤", showShortcut: true };
        }
      }
    }
    return { status: "off", text: "未出勤", showShortcut: true };
  }
}

// 勤怠ステータス表示の更新
// 判定結果に基づいてUIの表示を変更（ステータス点、テキスト、ボタン表示）
function updateAttendanceStatus(statusEl, shortcutBtn, logs, breakStart, breakEnd) {
  const statusInfo = getAttendanceStatus(logs, breakStart, breakEnd);
  
  // ステータス表示の更新（色付きの点とテキスト）
  statusEl.innerHTML = `
    <span class="status-dot ${statusInfo.status}"></span>
    <span class="status-text">${statusInfo.text}</span>
  `;

  // MoneyForwardショートカットボタンの表示制御
  shortcutBtn.style.display = statusInfo.showShortcut ? "inline-flex" : "none";
}

// ローカルストレージから勤怠ログの読み込み
// 保存された出退勤・プロジェクト切替の履歴を取得
function loadAttendanceLogs() {
  try {
    return JSON.parse(localStorage.getItem("attendanceLogs") || "[]");
  } catch {
    return []; // パース失敗時は空配列を返却
  }
}

// ===== テーマ管理（Auto / Light / Dark） =====
// ユーザーのシステム設定や手動選択に基づいてダーク/ライトモードを切り替え
(function setupTheme() {
  const root = document.documentElement;
  const media =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
  const getSystemTheme = () => (media && media.matches ? "dark" : "light");

  const MODE_KEY = "popup_theme_mode"; // "auto" | "light" | "dark"
  function applyTheme(mode) {
    const t = mode === "auto" ? getSystemTheme() : mode;
    root.setAttribute("data-theme", t);
  }
  function readMode() {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === "light" || saved === "dark" ? saved : "auto";
  }
  function writeMode(mode) {
    localStorage.setItem(MODE_KEY, mode);
  }
  function updateButtonLabel(btn) {
    if (!btn) return;
    const m = readMode();
    btn.textContent =
      m === "auto"
        ? "🌗"
        : m === "light"
        ? "🌞"
        : "🌙";
    btn.title = `テーマ: ${
      m === "auto" ? "自動（システム）" : m === "light" ? "ライト" : "ダーク"
    } - クリックで切替`;
  }

  // 初期化：Auto（既定）で適用
  applyTheme(readMode());
  if (media?.addEventListener)
    media.addEventListener("change", () => {
      if (readMode() === "auto") applyTheme("auto");
    });
  else if (media?.addListener)
    media.addListener(() => {
      if (readMode() === "auto") applyTheme("auto");
    });
  window.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("themeToggle");
    updateButtonLabel(btn);
    btn?.addEventListener("click", () => {
      const cur = readMode();
      const next = cur === "auto" ? "light" : cur === "light" ? "dark" : "auto";
      writeMode(next);
      applyTheme(next);
      updateButtonLabel(btn);
    });
  });
})();

// ===== メイン処理：DOM読み込み完了時の初期化 =====
document.addEventListener("DOMContentLoaded", async () => {
  // スプラッシュスクリーンの処理
  // アニメーション終了後（約3秒）にDOMから削除してパフォーマンス向上
  const splash = document.getElementById("splash");
  setTimeout(() => splash?.remove(), 3000);

  // 保存された設定データの読み込み
  let data = await loadAll();

  // DOM要素の取得
  const activeLabel = document.getElementById("activeLabel");           // アクティブプロジェクト表示
  const switchBtn = document.getElementById("switchBtn");               // プロジェクト切替ボタン
  const teamSelect = document.getElementById("teamSelect");             // チーム選択（隠し）
  const projectSelect = document.getElementById("projectSelect");       // プロジェクト選択（隠し）
  const sheetSelect = document.getElementById("sheetSelect");           // シート項目選択（隠し）
  const sheetMonth = document.getElementById("sheetMonth");             // シート月表示
  const refreshSheet = document.getElementById("refreshSheet");         // シート再読込ボタン
  const addTeamBtn = document.getElementById("addTeam");               // チーム追加ボタン
  const addProjBtn = document.getElementById("addProject");            // プロジェクト追加ボタン
  const breakStartInput = document.getElementById("breakStart");       // 休憩開始時刻入力
  const breakEndInput = document.getElementById("breakEnd");           // 休憩終了時刻入力
  const saveBreakBtn = document.getElementById("saveBreakTime");       // 休憩時間保存ボタン
  const breakStatus = document.getElementById("breakStatus");          // 休憩設定ステータス表示

  // 出社時間設定関連要素の取得
  const workStartInput = document.getElementById("workStart");         // 出社時刻入力
  const workEndInput = document.getElementById("workEnd");             // 退社時刻入力
  const enableNotificationsInput = document.getElementById("enableNotifications"); // 通知機能有効チェックボックス
  const enablePreWorkNotificationInput = document.getElementById("enablePreWorkNotification"); // 出社前通知有効チェックボックス
  const enableWorkEndNotificationInput = document.getElementById("enableWorkEndNotification"); // 退社通知有効チェックボックス
  const preWorkNotifyMinInput = document.getElementById("preWorkNotifyMin");       // 出社前通知分数入力
  const enableWorkDaysInput = document.getElementById("enableWorkDays");           // 平日のみ通知チェックボックス
  const saveWorkHoursBtn = document.getElementById("saveWorkTime");    // 出社時間設定保存ボタン
  const workTimeStatus = document.getElementById("workTimeStatus");    // 保存ステータス表示

  // カスタムセレクトボックス関連要素の取得
  const teamCustomSelect = document.getElementById("teamCustomSelect");       // チーム選択UI
  const teamDropdown = document.getElementById("teamDropdown");               // チームドロップダウン
  const teamDisplayText = document.getElementById("teamDisplayText");         // チーム表示テキスト
  const projectCustomSelect = document.getElementById("projectCustomSelect"); // プロジェクト選択UI  
  const projectDropdown = document.getElementById("projectDropdown");         // プロジェクトドロップダウン
  const projectDisplayText = document.getElementById("projectDisplayText");   // プロジェクト表示テキスト
  const sheetCustomSelect = document.getElementById("sheetCustomSelect");     // シート項目選択UI
  const sheetDropdown = document.getElementById("sheetDropdown");             // シートドロップダウン
  const sheetDisplayText = document.getElementById("sheetDisplayText");       // シート表示テキスト

  // 勤怠ステータス表示要素
  const attendanceStatusEl = document.getElementById("attendanceStatus");     // 出勤状態表示
  const clockInShortcutBtn = document.getElementById("clockInShortcut");     // MoneyForwardショートカット

  // 一時的な選択状態（切替ボタンは選択が変更された時のみ表示）
  let selectedTeamId = data.activeTeamId;
  let selectedProjectId = data.activeProjectId;

  // 初期表示の設定
  fillTeamSelect(teamSelect, data.teams, selectedTeamId);                    // チーム選択肢の設定
  fillProjectSelect(                                                         // プロジェクト選択肢の設定
    projectSelect,
    data.teams.find((t) => t.id === selectedTeamId),
    selectedProjectId
  );
  await updateActiveLabel(activeLabel, data);                                // アクティブプロジェクト表示更新
  breakStartInput.value = data.breakStart;                                   // 休憩開始時刻の設定
  breakEndInput.value = data.breakEnd;                                       // 休憩終了時刻の設定

  // 出社時間設定の初期化
  workStartInput.value = data.workStart;                                     // 出社時刻の設定
  workEndInput.value = data.workEnd;                                         // 退社時刻の設定
  enableNotificationsInput.checked = data.enableNotifications;              // 通知機能有効状態の設定
  enablePreWorkNotificationInput.checked = data.enablePreWorkNotification;  // 出社前通知有効状態の設定
  enableWorkEndNotificationInput.checked = data.enableWorkEndNotification;  // 退社通知有効状態の設定
  preWorkNotifyMinInput.value = data.preWorkNotifyMin;                       // 出社前通知分数の設定
  enableWorkDaysInput.checked = data.enableWorkDays;                         // 平日のみ通知状態の設定

  // 通知詳細設定の有効/無効状態を設定
  toggleNotificationSettings(data.enableNotifications);

  // カスタムセレクトのグローバルイベントリスナー設定
  setupCustomSelectEventListeners();

  // 通知機能オンオフのイベントハンドラー
  // チェックボックスの状態変更時に詳細設定の有効/無効を切り替える
  enableNotificationsInput.addEventListener("change", () => {
    toggleNotificationSettings(enableNotificationsInput.checked);
  });

  // 各カスタムセレクトのクリックハンドラー設定
  
  // チーム選択ドロップダウンの開閉制御
  teamCustomSelect.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = teamDropdown.classList.contains("show");
    
    // 他の全ドロップダウンを閉じる
    document.querySelectorAll(".select-dropdown").forEach(dd => dd.classList.remove("show"));
    document.querySelectorAll(".custom-select").forEach(cs => cs.classList.remove("open"));
    
    // 現在のドロップダウンが閉じていた場合のみ開く
    if (!isOpen) {
      teamDropdown.classList.add("show");
      teamCustomSelect.classList.add("open");
    }
  });

  // プロジェクト選択ドロップダウンの開閉制御
  projectCustomSelect.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = projectDropdown.classList.contains("show");
    
    // 他の全ドロップダウンを閉じる
    document.querySelectorAll(".select-dropdown").forEach(dd => dd.classList.remove("show"));
    document.querySelectorAll(".custom-select").forEach(cs => cs.classList.remove("open"));
    
    if (!isOpen) {
      projectDropdown.classList.add("show");
      projectCustomSelect.classList.add("open");
    }
  });

  // シート項目選択ドロップダウンの開閉制御
  sheetCustomSelect.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = sheetDropdown.classList.contains("show");
    
    // 他の全ドロップダウンを閉じる
    document.querySelectorAll(".select-dropdown").forEach(dd => dd.classList.remove("show"));
    document.querySelectorAll(".custom-select").forEach(cs => cs.classList.remove("open"));
    
    if (!isOpen) {
      sheetDropdown.classList.add("show");
      sheetCustomSelect.classList.add("open");
    }
  });

  // Init custom selects
  function updateCustomSelects() {
    // Team options
    const teamOptions = data.teams.map(t => ({ value: t.id, text: t.name }));
    
    initCustomSelect(
      teamCustomSelect,
      teamDropdown,
      teamDisplayText,
      teamOptions,
      selectedTeamId,
      (value) => {
        selectedTeamId = value;
        teamSelect.value = value;
        const team = data.teams.find((t) => t.id === selectedTeamId);
        selectedProjectId = team?.projects?.[0]?.id;
        fillProjectSelect(projectSelect, team, selectedProjectId);
        updateProjectCustomSelect();
        refreshSwitchVisibility();
      },
      "T"
    );
    
    updateProjectCustomSelect();
  }
  
  function updateProjectCustomSelect() {
    // Project options
    const selectedTeam = data.teams.find(t => t.id === selectedTeamId);
    const projectOptions = (selectedTeam?.projects || []).map(p => ({ value: p.id, text: p.name }));
    
    // Handle empty project list
    if (projectOptions.length === 0) {
      projectOptions.push({ value: "", text: "プロジェクトがありません" });
    }
    
    initCustomSelect(
      projectCustomSelect,
      projectDropdown,
      projectDisplayText,
      projectOptions,
      selectedProjectId,
      async (value) => {
        selectedProjectId = value;
        projectSelect.value = value;
        refreshSwitchVisibility();
        
        // プロジェクト内容を表示（プレビュー用）
        const selectedTeam = data.teams.find(t => t.id === selectedTeamId);
        const selectedProject = selectedTeam?.projects.find(p => p.id === value);
        if (selectedProject) {
          await displayProjectContent(selectedProject.name);
        } else {
          await displayProjectContent(null);
        }
      },
      "P"
    );
  }
  
  updateCustomSelects();

  // 勤怠ステータスの初期表示
  const attendanceLogs = loadAttendanceLogs();
  updateAttendanceStatus(attendanceStatusEl, clockInShortcutBtn, attendanceLogs, data.breakStart, data.breakEnd);

  // MoneyForwardショートカットボタンのイベントリスナー
  clockInShortcutBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://attendance.moneyforward.com/" });
  });

  function refreshSwitchVisibility() {
    const diff =
      selectedTeamId !== data.activeTeamId ||
      selectedProjectId !== data.activeProjectId;
    switchBtn.style.display = diff ? "inline-flex" : "none";
  }
  refreshSwitchVisibility();

  // Legacy select change handlers (for compatibility)
  teamSelect.addEventListener("change", () => {
    selectedTeamId = teamSelect.value;
    const team = data.teams.find((t) => t.id === selectedTeamId);
    selectedProjectId = team?.projects?.[0]?.id;
    fillProjectSelect(projectSelect, team, selectedProjectId);
    updateCustomSelects();
    refreshSwitchVisibility();
  });

  projectSelect.addEventListener("change", () => {
    selectedProjectId = projectSelect.value;
    updateProjectCustomSelect();
    refreshSwitchVisibility();
  });

  // Switch action
  switchBtn.addEventListener("click", async () => {
    const team = data.teams.find((t) => t.id === selectedTeamId);
    const proj = team?.projects?.find((p) => p.id === selectedProjectId);
    if (!team || !proj) return;

    data.activeTeamId = selectedTeamId;
    data.activeProjectId = selectedProjectId;
    await saveAll(data);
    await updateActiveLabel(activeLabel, data);
    refreshSwitchVisibility();

    sendProjectSwitch(team.name, proj.name);
    
    // 勤怠ステータスを確認してポップアップを閉じるかどうかを決定
    const attendanceLogs = loadAttendanceLogs();
    const statusInfo = getAttendanceStatus(attendanceLogs, data.breakStart, data.breakEnd);
    
    // 出勤中または休憩中の場合のみポップアップを閉じる
    if (statusInfo.status === "working" || statusInfo.status === "break") {
      window.close();
    }
    // 退勤中（status === "off"）の場合はポップアップを開いたまま
  });

  // Add team / project (quick)
  addTeamBtn.addEventListener("click", async () => {
    const name = prompt("追加するチーム名");
    if (!name) return;
    const t = { id: crypto.randomUUID(), name, projects: [] };
    data.teams.push(t);
    await saveAll(data);
    selectedTeamId = t.id;
    selectedProjectId = null;
    fillTeamSelect(teamSelect, data.teams, selectedTeamId);
    fillProjectSelect(projectSelect, t, selectedProjectId);
    updateCustomSelects();
    refreshSwitchVisibility();
  });

  addProjBtn.addEventListener("click", async () => {
    const team =
      data.teams.find((t) => t.id === selectedTeamId) || data.teams[0];
    const pj = prompt(`チーム「${team.name}」に追加するプロジェクト名`);
    if (!pj) return;
    const p = { id: crypto.randomUUID(), name: pj };
    team.projects.push(p);
    await saveAll(data);
    selectedProjectId = p.id;
    fillProjectSelect(projectSelect, team, selectedProjectId);
    updateCustomSelects();
    refreshSwitchVisibility();
  });

  // Sheet dropdown
  async function loadSheetHeaders(force = false) {
    const refreshStatus = document.getElementById("refreshStatus");
    
    // ステータス表示を初期化
    if (force) {
      refreshStatus.textContent = "読み取り中...";
      refreshStatus.style.color = "var(--muted)";
    }
    
    const { sheetMode, spreadsheetUrl, ssTeam, ssHeaderCache } =
      await chrome.storage.sync.get([
        "sheetMode",
        "spreadsheetUrl",
        "ssTeam",
        "ssHeaderCache",
      ]);
    
    sheetSelect.innerHTML = `<option value="">（シートから選択）</option>`;
    sheetMonth.textContent = monthSheetName();

    if (!sheetMode || !spreadsheetUrl) {
      // Update custom sheet select with empty state
      const emptyOptions = [{ value: "", text: "シートから選択" }];
      initCustomSelect(
        sheetCustomSelect,
        sheetDropdown,
        sheetDisplayText,
        emptyOptions,
        "",
        () => {},
        "S"
      );
      
      if (force) {
        refreshStatus.textContent = "スプレッドシート設定が無効です";
        refreshStatus.style.color = "var(--muted)";
        setTimeout(() => refreshStatus.textContent = "", 2000);
      }
      return;
    }

    const sheet = monthSheetName();
    let headers = (!force && ssHeaderCache && ssHeaderCache[sheet]) || [];

    if (!headers?.length || force) {
      try {
        headers = await fetchHeaderBR1Csv(spreadsheetUrl, sheet);
        const cache = ssHeaderCache || {};
        cache[sheet] = headers;
        await chrome.storage.sync.set({ ssHeaderCache: cache });
        
        if (force) {
          refreshStatus.textContent = `再読込完了 (${headers.length}項目)`;
          refreshStatus.style.color = "var(--ok)";
          setTimeout(() => refreshStatus.textContent = "", 2000);
        }
      } catch (error) {
        console.error("Failed to fetch sheet headers:", error);
        headers = [];
        
        if (force) {
          refreshStatus.textContent = "読み取り失敗";
          refreshStatus.style.color = "var(--danger)";
          setTimeout(() => refreshStatus.textContent = "", 2000);
        }
      }
    } else if (force) {
      // キャッシュから読み取った場合
      refreshStatus.textContent = `キャッシュから読込 (${headers.length}項目)`;
      refreshStatus.style.color = "var(--accent)";
      setTimeout(() => refreshStatus.textContent = "", 2000);
    }
    
    // Update both regular select and custom select
    headers.forEach((h) => sheetSelect.add(new Option(h, h)));
    
    const sheetOptions = [{ value: "", text: "シートから選択" }, ...headers.map(h => ({ value: h, text: h }))];
    initCustomSelect(
      sheetCustomSelect,
      sheetDropdown,
      sheetDisplayText,
      sheetOptions,
      "",
      async (value) => {
        if (!value) return;
        sheetSelect.value = value;
        
        const team = ensureTeam(data, ssTeam || "所属チーム");
        const pj = ensureProject(team, value);
        await saveAll(data);

        selectedTeamId = team.id;
        selectedProjectId = pj.id;

        fillTeamSelect(teamSelect, data.teams, selectedTeamId);
        fillProjectSelect(projectSelect, team, selectedProjectId);
        updateCustomSelects();
        refreshSwitchVisibility();
      },
      "S"
    );
  }
  
  await loadSheetHeaders(false);
  refreshSheet.addEventListener("click", async () => {
    await loadSheetHeaders(true);
  });

  // Break save
  saveBreakBtn.addEventListener("click", async () => {
    const s = breakStartInput.value,
      e = breakEndInput.value;
    if (!s || !e) {
      breakStatus.textContent = "開始/終了を入力してください";
      return;
    }
    if (s >= e) {
      breakStatus.textContent = "開始は終了より前にしてください";
      return;
    }
    data.breakStart = s;
    data.breakEnd = e;
    await saveAll(data);
    breakStatus.textContent = `保存：${s} ～ ${e}`;
    setTimeout(() => (breakStatus.textContent = ""), 2500);

    // 休憩時間変更時にステータス表示も更新
    const currentLogs = loadAttendanceLogs();
    updateAttendanceStatus(attendanceStatusEl, clockInShortcutBtn, currentLogs, s, e);
  });

  // 出社時間設定保存ボタンのイベントハンドラー
  // バリデーション後、設定を保存し、通知スケジュールを更新する
  saveWorkHoursBtn.addEventListener("click", async () => {
    const workStart = workStartInput.value;
    const workEnd = workEndInput.value;
    const enableNotifications = enableNotificationsInput.checked;
    const enablePreWorkNotification = enablePreWorkNotificationInput.checked;
    const enableWorkEndNotification = enableWorkEndNotificationInput.checked;
    const preWorkNotifyMin = parseInt(preWorkNotifyMinInput.value) || 15;
    const enableWorkDays = enableWorkDaysInput.checked;

    // バリデーション
    if (!workStart || !workEnd) {
      workTimeStatus.textContent = "出社時刻と退社時刻を入力してください";
      workTimeStatus.style.color = "#f31260";
      setTimeout(() => { workTimeStatus.textContent = ""; workTimeStatus.style.color = ""; }, 3000);
      return;
    }
    
    if (workStart >= workEnd) {
      workTimeStatus.textContent = "出社時刻は退社時刻より前にしてください";
      workTimeStatus.style.color = "#f31260";
      setTimeout(() => { workTimeStatus.textContent = ""; workTimeStatus.style.color = ""; }, 3000);
      return;
    }

    if (preWorkNotifyMin <= 0 || preWorkNotifyMin > 120) {
      workTimeStatus.textContent = "出社前通知は1〜120分で設定してください";
      workTimeStatus.style.color = "#f31260";
      setTimeout(() => { workTimeStatus.textContent = ""; workTimeStatus.style.color = ""; }, 3000);
      return;
    }

    // データ更新
    data.workStart = workStart;
    data.workEnd = workEnd;
    data.enableNotifications = enableNotifications;
    data.enablePreWorkNotification = enablePreWorkNotification;
    data.enableWorkEndNotification = enableWorkEndNotification;
    data.preWorkNotifyMin = preWorkNotifyMin;
    data.enableWorkDays = enableWorkDays;

    try {
      // 設定保存
      await saveAll(data);
      
      // background.jsに通知スケジュール更新を送信
      await chrome.runtime.sendMessage({
        type: "UPDATE_NOTIFICATION_SCHEDULE",
        workStart: workStart,
        workEnd: workEnd,
        enableNotifications: enableNotifications,
        enablePreWorkNotification: enablePreWorkNotification,
        enableWorkEndNotification: enableWorkEndNotification,
        preWorkNotifyMin: preWorkNotifyMin,
        enableWorkDays: enableWorkDays,
      });

      // 保存完了表示
      workTimeStatus.textContent = "保存しました";
      workTimeStatus.style.color = "#17c964";
      setTimeout(() => { 
        workTimeStatus.textContent = ""; 
        workTimeStatus.style.color = "";
      }, 2500);

    } catch (error) {
      console.error("出社時間設定の保存に失敗しました:", error);
      workTimeStatus.textContent = "保存に失敗しました。再度お試しください。";
      workTimeStatus.style.color = "#f31260";
      setTimeout(() => { workTimeStatus.textContent = ""; workTimeStatus.style.color = ""; }, 3000);
    }
  });
});
