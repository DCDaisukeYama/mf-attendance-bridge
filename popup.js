// ===== popup.js v1.0.10 =====
// Chrome拡張機能のポップアップページメインスクリプト
// プロジェクト切り替え、勤怠管理、スプレッドシート連携機能を提供
// 修正版: プロジェクトメンバー表示機能追加、リアルタイム更新対応

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
  ENABLE_STARTUP_ANIMATION: "enableStartupAnimation", // 起動アニメーション有効フラグ
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
    enableNotifications: true,    // 通知機能デフォルト有効に修正
    enablePreWorkNotification: true,  // 出社前通知デフォルト有効
    enableWorkEndNotification: true,  // 退社通知デフォルト有効
    preWorkNotifyMin: 15,         // 出社前通知デフォルト15分前
    enableWorkDays: true,         // 平日のみ通知デフォルト有効
    enableStartupAnimation: true, // 起動アニメーションデフォルト有効
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
    KEY.ENABLE_STARTUP_ANIMATION,
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
    enableNotifications: saved.enableNotifications !== undefined ? saved.enableNotifications : true,
    enablePreWorkNotification: saved.enablePreWorkNotification !== undefined ? saved.enablePreWorkNotification : true,
    enableWorkEndNotification: saved.enableWorkEndNotification !== undefined ? saved.enableWorkEndNotification : true,
    preWorkNotifyMin: saved.preWorkNotifyMin || 15,
    enableWorkDays: saved.enableWorkDays !== undefined ? saved.enableWorkDays : true,
    enableStartupAnimation: saved.enableStartupAnimation !== undefined ? saved.enableStartupAnimation : true,
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
    [KEY.ENABLE_STARTUP_ANIMATION]: data.enableStartupAnimation,
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

// ===== プロジェクトメンバー管理関数群 =====

// グローバル変数：メンバーデータのキャッシュ
let currentMemberData = null;
let currentSelectedTeam = null;
let selectedMembers = {}; // プロジェクトごとの選択メンバー {projectId: [memberIds]}
let currentActiveSelectionGroup = null; // 現在アクティブな選択グループ

// アクティブプロジェクトカード内の所属メンバーエリアの表示/非表示を制御
function toggleProjectMemberCard(show) {
  const memberArea = document.getElementById("activeProjectMembers");
  const showProjectMembersBtn = document.getElementById("showProjectMembers");

  if (memberArea) {
    memberArea.style.display = show ? "block" : "none";
  }

  if (showProjectMembersBtn) {
    showProjectMembersBtn.textContent = show ? "閉じる" : "所属メンバー";
  }
}

// チーム内プロジェクトタブを生成・表示
function displayProjectTabs(teamName, memberData) {
  const projectTabsContainer = document.getElementById("projectTabs");
  const membersListContainer = document.getElementById("membersList");

  if (!projectTabsContainer || !membersListContainer || !memberData || !memberData.teams) {
    return;
  }

  const team = memberData.teams[teamName];
  if (!team || !team.groups) {
    projectTabsContainer.style.display = "none";
    return;
  }

  // タブボタンを生成
  projectTabsContainer.innerHTML = "";
  const groupNames = Object.keys(team.groups);

  if (groupNames.length <= 1) {
    // 1つ以下のグループの場合はタブを非表示
    projectTabsContainer.style.display = "none";
    if (groupNames.length === 1) {
      displayGroupMembers(teamName, groupNames[0], memberData);
    }
    return;
  }

  // 複数グループの場合はタブを表示
  projectTabsContainer.style.display = "flex";

  groupNames.forEach((groupName, index) => {
    const tabButton = document.createElement("button");
    tabButton.className = `project-tab ${index === 0 ? "active" : ""}`;
    tabButton.textContent = `${teamName}${groupName}`;
    tabButton.dataset.team = teamName;
    tabButton.dataset.group = groupName;

    tabButton.addEventListener("click", () => {
      // 全てのタブのアクティブ状態をリセット
      document.querySelectorAll(".project-tab").forEach(tab => {
        tab.classList.remove("active");
      });

      // クリックされたタブをアクティブに
      tabButton.classList.add("active");

      // 対応するグループのメンバーを表示
      displayGroupMembers(teamName, groupName, memberData);
    });

    projectTabsContainer.appendChild(tabButton);
  });

  // 最初のタブのメンバーを表示
  if (groupNames.length > 0) {
    displayGroupMembers(teamName, groupNames[0], memberData);
  }
}

// グループのメンバーを表示
function displayGroupMembers(teamName, groupName, memberData) {
  const membersListContainer = document.getElementById("membersList");
  const memberStatusContainer = document.getElementById("memberStatus");

  if (!membersListContainer) {
    return;
  }

  const team = memberData.teams?.[teamName];
  const group = team?.groups?.[groupName];

  if (!group || !group.members || group.members.length === 0) {
    membersListContainer.innerHTML = '<div class="members-empty">メンバーが見つかりません</div>';
    if (memberStatusContainer) {
      memberStatusContainer.textContent = "";
    }
    return;
  }

  // メンバーサマリー情報
  const keyHolderCount = group.members.filter(member => member.isKeyHolder).length;
  const summaryHtml = `
    <div class="member-summary">
      <span>メンバー数: <span class="member-count">${group.members.length}名</span></span>
      <span>鍵保有者: <span class="member-count">${keyHolderCount}名</span></span>
    </div>
  `;

  // メンバーリストのHTML生成
  const membersHtml = group.members.map(member => {
    const keyHolderBadge = member.isKeyHolder
      ? '<span class="key-holder-badge">鍵保有者</span>'
      : '';

    return `
      <div class="member-item">
        <div class="member-info">
          <span class="member-number">${member.number}</span>
          <span class="member-name">${member.name}</span>
        </div>
        <div class="member-badges">
          ${keyHolderBadge}
        </div>
      </div>
    `;
  }).join("");

  membersListContainer.innerHTML = summaryHtml + membersHtml;

  // ステータス更新
  if (memberStatusContainer) {
    const updateTime = new Date().toLocaleString("ja-JP");
    memberStatusContainer.textContent = `最終更新: ${updateTime}`;
  }
}

// メンバーデータの取得と表示
async function loadAndDisplayMembers(forceRefresh = false) {
  const membersLoadingContainer = document.getElementById("membersLoading");
  const memberStatusContainer = document.getElementById("memberStatus");

  try {
    // ローディング表示
    if (membersLoadingContainer) {
      membersLoadingContainer.style.display = "block";
    }

    // メンバー情報用スプレッドシート設定を取得
    const settings = await chrome.storage.sync.get(["memberSpreadsheetUrl"]);
    if (!settings.memberSpreadsheetUrl) {
      throw new Error("メンバー情報スプレッドシートURLが設定されていません。設定ページで「メンバー情報スプレッドシート URL」を設定してください。");
    }

    // SpreadsheetManagerを使用してメンバーデータを取得
    if (!window.SpreadsheetManager) {
      throw new Error("SpreadsheetManagerが読み込まれていません。ページを再読み込みしてください。");
    }
    const spreadsheetManager = new window.SpreadsheetManager(settings.memberSpreadsheetUrl);
    currentMemberData = await spreadsheetManager.fetchMemberDataWithCache(forceRefresh);

    // 現在選択されているチームに基づいてメンバーを表示
    if (currentSelectedTeam && currentMemberData.teams[currentSelectedTeam]) {
      displayProjectTabs(currentSelectedTeam, currentMemberData);
      // 全チームメンバーも表示
      displayAllMemberTabs(currentSelectedTeam, currentMemberData);
    }

    // ローディング非表示
    if (membersLoadingContainer) {
      membersLoadingContainer.style.display = "none";
    }

    // 成功ステータス
    if (memberStatusContainer) {
      const updateTime = new Date().toLocaleString("ja-JP");
      const summary = currentMemberData.summary;
      memberStatusContainer.innerHTML = `
        <span style="color: var(--ok);">✓ 読み込み完了 (${updateTime})</span><br>
        <span style="font-size: 10px;">チーム数: ${summary.teamCount} | 総メンバー数: ${summary.totalMembers}名 | 鍵保有者: ${summary.keyHolderCount}名</span>
      `;
    }

  } catch (error) {
    console.error("メンバーデータの読み込みエラー:", error);

    // エラー表示
    if (membersLoadingContainer) {
      membersLoadingContainer.innerHTML = `<div class="members-empty" style="color: var(--danger);">エラー: ${error.message}</div>`;
    }

    if (memberStatusContainer) {
      memberStatusContainer.innerHTML = `<span style="color: var(--danger);">✗ 読み込み失敗: ${error.message}</span>`;
    }

    toggleProjectMemberCard(false);
  }
}

// チーム選択変更時のメンバー表示更新
async function updateMemberDisplayForTeam(teamName) {
  console.log(`Updating member display for team: ${teamName}`);
  console.log(`Current member data available:`, !!currentMemberData);
  console.log(`Team exists in data:`, !!(currentMemberData && currentMemberData.teams[teamName]));

  currentSelectedTeam = teamName;

  if (currentMemberData && currentMemberData.teams[teamName]) {
    console.log(`Loading member data for team: ${teamName}`);
    displayProjectTabs(teamName, currentMemberData);
    // 全チームメンバーも表示
    displayAllMemberTabs(teamName, currentMemberData);
  } else if (currentMemberData) {
    // データはあるが、選択されたチームがスプレッドシートに存在しない場合
    console.log(`Team ${teamName} not found in member data`);
    const memberStatusContainer = document.getElementById("memberStatus");
    if (memberStatusContainer) {
      memberStatusContainer.innerHTML = `<span style="color: var(--warning);">選択されたチーム「${teamName}」はスプレッドシートに存在しません</span>`;
    }
  } else {
    // データがまだ読み込まれていない場合
    console.log(`Member data not loaded yet, loading now for team: ${teamName}`);
    await loadAndDisplayMembers();
  }
}

// ===== メンバー編集機能 =====

// メンバー編集モードを開始
function startMemberEditMode() {
  // モーダルを表示
  showMemberEditModal();

  // 現在選択されているチームのメンバー編集画面を表示
  if (currentSelectedTeam && currentMemberData && currentMemberData.teams[currentSelectedTeam]) {
    displayMemberSelectionTabsModal(currentSelectedTeam, currentMemberData);
  } else {
    // メンバーデータがない場合は読み込み
    loadAndDisplayMembers().then(() => {
      if (currentSelectedTeam && currentMemberData && currentMemberData.teams[currentSelectedTeam]) {
        displayMemberSelectionTabsModal(currentSelectedTeam, currentMemberData);
      }
    }).catch(error => {
      console.error('Error loading member data for edit mode:', error);
    });
  }
}

// メンバー編集カードの表示/非表示を制御
function toggleMemberSelectionCard(show) {
  const selectionCard = document.getElementById("memberSelectionCard");
  if (selectionCard) {
    console.log(`${show ? 'Showing' : 'Hiding'} member selection card`);
    selectionCard.style.display = show ? "block" : "none";
  } else {
    console.error("Member selection card element not found");
  }
}

// メンバー編集モーダルの表示
function showMemberEditModal() {
  const modal = document.getElementById("memberEditModal");
  if (modal) {
    modal.style.display = "flex";
  }
}

// メンバー編集モーダルの非表示
function hideMemberEditModal() {
  const modal = document.getElementById("memberEditModal");
  if (modal) {
    modal.style.display = "none";
  }
}

// モーダル内でメンバー選択タブを表示
function displayMemberSelectionTabsModal(teamName, memberData) {
  const selectionTabsContainer = document.getElementById("memberSelectionTabsModal");
  const selectionListContainer = document.getElementById("memberSelectionListModal");

  if (!selectionTabsContainer || !selectionListContainer || !memberData || !memberData.teams) {
    return;
  }

  const team = memberData.teams[teamName];
  if (!team || !team.groups) {
    selectionTabsContainer.style.display = "none";
    return;
  }

  // タブボタンを生成
  selectionTabsContainer.innerHTML = "";
  const groupNames = Object.keys(team.groups);

  if (groupNames.length <= 1) {
    // 1つ以下のグループの場合はタブを非表示
    selectionTabsContainer.style.display = "none";
    if (groupNames.length === 1) {
      displayMemberSelectionListModal(teamName, groupNames[0], memberData).catch(error => {
        console.error('Error displaying single group member list:', error);
      });
    }
    return;
  }

  // 複数グループの場合はタブを表示
  selectionTabsContainer.style.display = "flex";

  groupNames.forEach((groupName, index) => {
    const tabButton = document.createElement("button");
    tabButton.className = `member-selection-tab ${index === 0 ? "active" : ""}`;
    tabButton.textContent = groupName;
    tabButton.dataset.team = teamName;
    tabButton.dataset.group = groupName;

    tabButton.addEventListener("click", () => {
      // 全てのタブのアクティブ状態をリセット
      document.querySelectorAll(".member-selection-tab").forEach(tab => {
        tab.classList.remove("active");
      });

      // クリックされたタブをアクティブに
      tabButton.classList.add("active");

      // 対応するグループのメンバー選択リストを表示
      displayMemberSelectionListModal(teamName, groupName, memberData).catch(error => {
        console.error('Error displaying member selection list:', error);
      });
    });

    selectionTabsContainer.appendChild(tabButton);
  });

  // 最初のタブのコンテンツを表示
  displayMemberSelectionListModal(teamName, groupNames[0], memberData).catch(error => {
    console.error('Error displaying initial member selection list:', error);
  });
}

// モーダル内でメンバー選択リストを表示
async function displayMemberSelectionListModal(teamName, groupName, memberData) {
  const selectionListContainer = document.getElementById("memberSelectionListModal");
  const selectionStatusContainer = document.getElementById("memberSelectionStatusModal");

  if (!selectionListContainer) {
    return;
  }

  currentActiveSelectionGroup = groupName;

  const team = memberData.teams?.[teamName];
  const group = team?.groups?.[groupName];

  if (!group || !group.members || group.members.length === 0) {
    selectionListContainer.innerHTML = '<div class="member-selection-empty">メンバーが見つかりません</div>';
    if (selectionStatusContainer) {
      selectionStatusContainer.textContent = "";
    }
    return;
  }

  // 現在のプロジェクトID（チーム名とプロジェクト名から）
  const currentProjectKey = await getCurrentProjectKey();

  // 選択状況サマリー情報
  const selectedCount = (selectedMembers[currentProjectKey] || []).length;
  const summaryHtml = `
    <div class="member-selection-summary">
      <span>グループ: <span class="selected-member-count">${groupName}</span></span>
      <span>選択中: <span class="selected-member-count">${selectedCount}名</span></span>
    </div>
  `;

  // メンバー選択リストのHTML生成
  const membersHtml = group.members.map(member => {
    const memberKey = `${member.team}-${member.group}-${member.number}`;
    const isSelected = (selectedMembers[currentProjectKey] || []).includes(memberKey);
    const keyHolderBadge = member.isKeyHolder
      ? '<span class="key-holder-badge">鍵保有者</span>'
      : '';

    return `
      <div class="member-selection-item ${isSelected ? 'selected' : ''}" data-member-key="${memberKey}">
        <input type="checkbox" class="member-checkbox" ${isSelected ? 'checked' : ''}
               data-member-key="${memberKey}">
        <div class="member-selection-info">
          <span class="member-selection-number">${member.number}</span>
          <span class="member-selection-name">${member.name}</span>
        </div>
        <div class="member-selection-badges">
          ${keyHolderBadge}
        </div>
      </div>
    `;
  }).join('');

  // HTMLをコンテナに設定
  selectionListContainer.innerHTML = summaryHtml + membersHtml;

  // チェックボックスのイベントリスナーを設定
  selectionListContainer.querySelectorAll('.member-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleMemberSelectionChangeModal);
  });

  // メンバー選択アイテムのクリックイベントを設定
  selectionListContainer.querySelectorAll('.member-selection-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.type !== 'checkbox') {
        const checkbox = item.querySelector('.member-checkbox');
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          handleMemberSelectionChangeModal({ target: checkbox });
        }
      }
    });
  });

  // 選択状況の更新
  updateMemberSelectionStatusModal();
}

// モーダル内でメンバー選択変更処理
async function handleMemberSelectionChangeModal(event) {
  const checkbox = event.target;
  const memberKey = checkbox.dataset.memberKey;
  const currentProjectKey = await getCurrentProjectKey();

  if (!selectedMembers[currentProjectKey]) {
    selectedMembers[currentProjectKey] = [];
  }

  if (checkbox.checked) {
    // 選択に追加
    if (!selectedMembers[currentProjectKey].includes(memberKey)) {
      selectedMembers[currentProjectKey].push(memberKey);
    }
  } else {
    // 選択から削除
    const index = selectedMembers[currentProjectKey].indexOf(memberKey);
    if (index > -1) {
      selectedMembers[currentProjectKey].splice(index, 1);
    }
  }

  // 親要素のハイライト状態を更新
  const memberItem = checkbox.closest('.member-selection-item');
  if (memberItem) {
    if (checkbox.checked) {
      memberItem.classList.add('selected');
    } else {
      memberItem.classList.remove('selected');
    }
  }

  // 選択状況の更新
  updateMemberSelectionStatusModal();

  // 選択されたメンバー情報をストレージに保存
  await chrome.storage.local.set({ selectedMembers });
}

// モーダル内で選択状況ステータス更新
async function updateMemberSelectionStatusModal() {
  const statusContainer = document.getElementById("memberSelectionStatusModal");
  if (!statusContainer) return;

  const currentProjectKey = await getCurrentProjectKey();
  const selectedCount = (selectedMembers[currentProjectKey] || []).length;
  const currentProjectName = await getCurrentProjectName();

  statusContainer.textContent = `プロジェクト「${currentProjectName}」に ${selectedCount}名 が選択されています`;

  // サマリー情報も更新
  const summaryElements = document.querySelectorAll(".member-selection-summary .selected-member-count");
  summaryElements.forEach((element, index) => {
    if (index === 1) { // 「選択中: X名」の部分
      element.textContent = `${selectedCount}名`;
    }
  });
}

// モーダル内で現在のグループの全メンバーを選択
async function selectAllMembersInCurrentGroupModal() {
  const currentProjectKey = await getCurrentProjectKey();
  if (!currentActiveSelectionGroup || !currentMemberData || !currentSelectedTeam) {
    return;
  }

  const team = currentMemberData.teams[currentSelectedTeam];
  const group = team?.groups[currentActiveSelectionGroup];
  if (!group || !group.members) {
    return;
  }

  if (!selectedMembers[currentProjectKey]) {
    selectedMembers[currentProjectKey] = [];
  }

  // 現在のグループの全メンバーを選択に追加
  group.members.forEach(member => {
    const memberKey = `${member.team}-${member.group}-${member.number}`;
    if (!selectedMembers[currentProjectKey].includes(memberKey)) {
      selectedMembers[currentProjectKey].push(memberKey);
    }
  });

  // UI更新
  await updateMemberSelectionUIModal();
  await chrome.storage.local.set({ selectedMembers });
}

// モーダル内で現在のグループの全メンバー選択を解除
async function clearAllMembersInCurrentGroupModal() {
  const currentProjectKey = await getCurrentProjectKey();
  if (!currentActiveSelectionGroup || !currentMemberData || !currentSelectedTeam) {
    return;
  }

  const team = currentMemberData.teams[currentSelectedTeam];
  const group = team?.groups[currentActiveSelectionGroup];
  if (!group || !group.members) {
    return;
  }

  if (!selectedMembers[currentProjectKey]) {
    selectedMembers[currentProjectKey] = [];
  }

  // 現在のグループのメンバーを選択から削除
  group.members.forEach(member => {
    const memberKey = `${member.team}-${member.group}-${member.number}`;
    const index = selectedMembers[currentProjectKey].indexOf(memberKey);
    if (index > -1) {
      selectedMembers[currentProjectKey].splice(index, 1);
    }
  });

  // UI更新
  await updateMemberSelectionUIModal();
  await chrome.storage.local.set({ selectedMembers });
}

// モーダルのUI状態を更新
async function updateMemberSelectionUIModal() {
  const currentProjectKey = await getCurrentProjectKey();
  const selectionListContainer = document.getElementById("memberSelectionListModal");

  if (!selectionListContainer) return;

  // チェックボックスの状態を更新
  selectionListContainer.querySelectorAll('.member-checkbox').forEach(checkbox => {
    const memberKey = checkbox.dataset.memberKey;
    const isSelected = (selectedMembers[currentProjectKey] || []).includes(memberKey);
    checkbox.checked = isSelected;

    // 親要素のハイライト状態も更新
    const memberItem = checkbox.closest('.member-selection-item');
    if (memberItem) {
      if (isSelected) {
        memberItem.classList.add('selected');
      } else {
        memberItem.classList.remove('selected');
      }
    }
  });

  // 選択状況の更新
  updateMemberSelectionStatusModal();
}

// モーダルでメンバー選択を確定
async function confirmMemberSelectionModal() {
  // メンバー表示を更新
  await updateProjectMemberDisplay();

  // モーダルを閉じる
  hideMemberEditModal();

  console.log('Member selection confirmed in modal');
}

// 全チームメンバーカードの表示/非表示を制御
function toggleAllMembersCard(show) {
  const allMembersCard = document.getElementById("allMembersCard");
  if (allMembersCard) {
    console.log(`${show ? 'Showing' : 'Hiding'} all members card`);
    allMembersCard.style.display = show ? "block" : "none";
  } else {
    console.error("All members card element not found");
  }
}

// メンバー選択タブを生成・表示
function displayMemberSelectionTabs(teamName, memberData) {
  const selectionTabsContainer = document.getElementById("memberSelectionTabs");
  const selectionListContainer = document.getElementById("memberSelectionList");

  if (!selectionTabsContainer || !selectionListContainer || !memberData || !memberData.teams) {
    return;
  }

  const team = memberData.teams[teamName];
  if (!team || !team.groups) {
    selectionTabsContainer.style.display = "none";
    return;
  }

  // タブボタンを生成
  selectionTabsContainer.innerHTML = "";
  const groupNames = Object.keys(team.groups);

  if (groupNames.length <= 1) {
    // 1つ以下のグループの場合はタブを非表示
    selectionTabsContainer.style.display = "none";
    if (groupNames.length === 1) {
      displayMemberSelectionList(teamName, groupNames[0], memberData).catch(error => {
        console.error('Error displaying single group member list:', error);
      });
    }
    return;
  }

  // 複数グループの場合はタブを表示
  selectionTabsContainer.style.display = "flex";

  groupNames.forEach((groupName, index) => {
    const tabButton = document.createElement("button");
    tabButton.className = `member-selection-tab ${index === 0 ? "active" : ""}`;
    tabButton.textContent = groupName;
    tabButton.dataset.team = teamName;
    tabButton.dataset.group = groupName;

    tabButton.addEventListener("click", () => {
      // 全てのタブのアクティブ状態をリセット
      document.querySelectorAll(".member-selection-tab").forEach(tab => {
        tab.classList.remove("active");
      });

      // クリックされたタブをアクティブに
      tabButton.classList.add("active");

      // 対応するグループのメンバー選択リストを表示
      displayMemberSelectionList(teamName, groupName, memberData).catch(error => {
        console.error('Error displaying member selection list:', error);
      });
    });

    selectionTabsContainer.appendChild(tabButton);
  });

  // 最初のタブのメンバー選択リストを表示
  if (groupNames.length > 0) {
    currentActiveSelectionGroup = groupNames[0];
    displayMemberSelectionList(teamName, groupNames[0], memberData).catch(error => {
      console.error('Error displaying initial member selection list:', error);
    });
  }
}

// メンバー選択リストを表示
async function displayMemberSelectionList(teamName, groupName, memberData) {
  const selectionListContainer = document.getElementById("memberSelectionList");
  const selectionStatusContainer = document.getElementById("memberSelectionStatus");

  if (!selectionListContainer) {
    return;
  }

  currentActiveSelectionGroup = groupName;

  const team = memberData.teams?.[teamName];
  const group = team?.groups?.[groupName];

  if (!group || !group.members || group.members.length === 0) {
    selectionListContainer.innerHTML = '<div class="member-selection-empty">メンバーが見つかりません</div>';
    if (selectionStatusContainer) {
      selectionStatusContainer.textContent = "";
    }
    return;
  }

  // 現在のプロジェクトID（チーム名とプロジェクト名から）
  const currentProjectKey = await getCurrentProjectKey();

  // 選択状況サマリー情報
  const selectedCount = (selectedMembers[currentProjectKey] || []).length;
  const summaryHtml = `
    <div class="member-selection-summary">
      <span>グループ: <span class="selected-member-count">${groupName}</span></span>
      <span>選択中: <span class="selected-member-count">${selectedCount}名</span></span>
    </div>
  `;

  // メンバー選択リストのHTML生成
  const membersHtml = group.members.map(member => {
    const memberKey = `${member.team}-${member.group}-${member.number}`;
    const isSelected = (selectedMembers[currentProjectKey] || []).includes(memberKey);
    const keyHolderBadge = member.isKeyHolder
      ? '<span class="key-holder-badge">鍵保有者</span>'
      : '';

    return `
      <div class="member-selection-item ${isSelected ? 'selected' : ''}" data-member-key="${memberKey}">
        <input type="checkbox" class="member-checkbox" ${isSelected ? 'checked' : ''}
               data-member-key="${memberKey}">
        <div class="member-selection-info">
          <span class="member-selection-number">${member.number}</span>
          <span class="member-selection-name">${member.name}</span>
        </div>
        <div class="member-selection-badges">
          ${keyHolderBadge}
        </div>
      </div>
    `;
  }).join("");

  selectionListContainer.innerHTML = summaryHtml + membersHtml;

  // チェックボックスのイベントリスナーを追加
  addMemberSelectionEventListeners();

  // ステータス更新
  updateMemberSelectionStatus().catch(error => {
    console.error('Error updating member selection status:', error);
  });
}

// メンバー選択のイベントリスナーを追加
function addMemberSelectionEventListeners() {
  // チェックボックスのクリックイベント
  document.querySelectorAll('.member-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const memberKey = e.target.dataset.memberKey;
      const parentItem = e.target.closest('.member-selection-item');

      if (e.target.checked) {
        addSelectedMember(memberKey).catch(error => console.error('Error adding member:', error));
        parentItem.classList.add('selected');
      } else {
        removeSelectedMember(memberKey).catch(error => console.error('Error removing member:', error));
        parentItem.classList.remove('selected');
      }

      updateMemberSelectionStatus().catch(error => console.error('Error updating status:', error));
    });
  });

  // 行のクリックでチェックボックスをトグル
  document.querySelectorAll('.member-selection-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.type !== 'checkbox') {
        const checkbox = item.querySelector('.member-checkbox');
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
    });
  });
}

// 選択メンバーを追加
async function addSelectedMember(memberKey) {
  const currentProjectKey = await getCurrentProjectKey();
  if (!selectedMembers[currentProjectKey]) {
    selectedMembers[currentProjectKey] = [];
  }
  if (!selectedMembers[currentProjectKey].includes(memberKey)) {
    selectedMembers[currentProjectKey].push(memberKey);
    console.log(`Added member ${memberKey} to project ${currentProjectKey}`);
    await saveMemberSelections(); // 即座に保存
    await updateProjectMemberDisplay(); // プロジェクトメンバー表示を更新
  }
}

// 選択メンバーを削除
async function removeSelectedMember(memberKey) {
  const currentProjectKey = await getCurrentProjectKey();
  if (selectedMembers[currentProjectKey]) {
    const originalLength = selectedMembers[currentProjectKey].length;
    selectedMembers[currentProjectKey] = selectedMembers[currentProjectKey].filter(key => key !== memberKey);

    if (selectedMembers[currentProjectKey].length !== originalLength) {
      console.log(`Removed member ${memberKey} from project ${currentProjectKey}`);
      await saveMemberSelections(); // 即座に保存
      await updateProjectMemberDisplay(); // プロジェクトメンバー表示を更新
    }
  }
}

// 現在のプロジェクト名を取得
async function getCurrentProjectName() {
  try {
    const teamSelect = document.getElementById('teamSelect');
    const projectSelect = document.getElementById('projectSelect');

    const selectedTeamId = teamSelect?.value;
    const selectedProjectId = projectSelect?.value;

    if (!selectedTeamId || !selectedProjectId) {
      return '未選択';
    }

    const teamOption = teamSelect.options[teamSelect.selectedIndex];
    const projectOption = projectSelect.options[projectSelect.selectedIndex];

    const teamName = teamOption?.text || selectedTeamId;
    const projectName = projectOption?.text || selectedProjectId;

    return `${teamName} - ${projectName}`;
  } catch (error) {
    console.error('Error getting current project name:', error);
    return '取得エラー';
  }
}

// 現在のプロジェクトキーを取得
async function getCurrentProjectKey() {
  try {
    // 現在選択されているチーム・プロジェクト情報を取得
    const teamSelect = document.getElementById('teamSelect');
    const projectSelect = document.getElementById('projectSelect');

    const selectedTeamId = teamSelect?.value;
    const selectedProjectId = projectSelect?.value;

    if (!selectedTeamId || !selectedProjectId) {
      console.log('Team or project not selected, using default key');
      return 'default';
    }

    // チーム名とプロジェクト名から一意のキーを生成
    const teamOption = teamSelect.options[teamSelect.selectedIndex];
    const projectOption = projectSelect.options[projectSelect.selectedIndex];

    const teamName = teamOption?.text || selectedTeamId;
    const projectName = projectOption?.text || selectedProjectId;

    const projectKey = `${teamName}-${projectName}`;
    console.log(`Current project key: ${projectKey}`);
    return projectKey;
  } catch (error) {
    console.error('Error getting current project key:', error);
    return 'default';
  }
}

// 全選択
async function selectAllMembersInCurrentGroup() {
  if (!currentMemberData || !currentSelectedTeam || !currentActiveSelectionGroup) {
    return;
  }

  const team = currentMemberData.teams[currentSelectedTeam];
  const group = team?.groups?.[currentActiveSelectionGroup];

  if (group && group.members) {
    const currentProjectKey = await getCurrentProjectKey();
    if (!selectedMembers[currentProjectKey]) {
      selectedMembers[currentProjectKey] = [];
    }

    group.members.forEach(member => {
      const memberKey = `${member.team}-${member.group}-${member.number}`;
      if (!selectedMembers[currentProjectKey].includes(memberKey)) {
        selectedMembers[currentProjectKey].push(memberKey);
      }
    });

    // データを保存
    await saveMemberSelections();
    console.log(`Selected all members in ${currentSelectedTeam} ${currentActiveSelectionGroup} for project ${currentProjectKey}`);

    // UIを更新
    await displayMemberSelectionList(currentSelectedTeam, currentActiveSelectionGroup, currentMemberData);
    await updateProjectMemberDisplay(); // プロジェクトメンバー表示を更新
  }
}

// 全解除
async function clearAllMembersInCurrentGroup() {
  if (!currentMemberData || !currentSelectedTeam || !currentActiveSelectionGroup) {
    return;
  }

  const team = currentMemberData.teams[currentSelectedTeam];
  const group = team?.groups?.[currentActiveSelectionGroup];

  if (group && group.members) {
    const currentProjectKey = await getCurrentProjectKey();
    if (selectedMembers[currentProjectKey]) {
      group.members.forEach(member => {
        const memberKey = `${member.team}-${member.group}-${member.number}`;
        selectedMembers[currentProjectKey] = selectedMembers[currentProjectKey].filter(key => key !== memberKey);
      });
    }

    // データを保存
    await saveMemberSelections();
    console.log(`Cleared all members in ${currentSelectedTeam} ${currentActiveSelectionGroup} for project ${currentProjectKey}`);

    // UIを更新
    await displayMemberSelectionList(currentSelectedTeam, currentActiveSelectionGroup, currentMemberData);
    await updateProjectMemberDisplay(); // プロジェクトメンバー表示を更新
  }
}

// メンバー選択の確定
async function confirmMemberSelection() {
  const currentProjectKey = await getCurrentProjectKey();
  const selectedMemberKeys = selectedMembers[currentProjectKey] || [];

  if (selectedMemberKeys.length === 0) {
    alert('メンバーが選択されていません。');
    return;
  }

  // 選択されたメンバー情報を表示用に更新
  await updateProjectMemberDisplay();

  // 成功メッセージ
  const selectionStatusContainer = document.getElementById("memberSelectionStatus");
  if (selectionStatusContainer) {
    selectionStatusContainer.innerHTML = `<span style="color: var(--ok);">✓ ${selectedMemberKeys.length}名のメンバーを確定しました</span>`;
    setTimeout(async () => {
      await updateMemberSelectionStatus();
    }, 3000);
  }

  // 選択データは個別選択時に既に保存済み
}

// メンバー選択状況の更新
async function updateMemberSelectionStatus() {
  const selectionStatusContainer = document.getElementById("memberSelectionStatus");
  if (!selectionStatusContainer) {
    return;
  }

  const currentProjectKey = await getCurrentProjectKey();
  const selectedCount = (selectedMembers[currentProjectKey] || []).length;
  const updateTime = new Date().toLocaleString("ja-JP");

  selectionStatusContainer.innerHTML = `
    <span>選択中: <span class="selected-member-count">${selectedCount}名</span></span>
    <span style="margin-left: 16px; font-size: 10px;">最終更新: ${updateTime}</span>
  `;
}

// プロジェクトメンバー表示を更新（選択されたメンバーのみ表示）
async function updateProjectMemberDisplay() {
  const currentProjectKey = await getCurrentProjectKey();
  const selectedMemberKeys = selectedMembers[currentProjectKey] || [];

  console.log(`Updating project member display for ${currentProjectKey}: ${selectedMemberKeys.length} members`);

  if (selectedMemberKeys.length === 0) {
    toggleProjectMemberCard(false);
    return;
  }

  // プロジェクトメンバーカードを表示
  toggleProjectMemberCard(true);

  // 選択されたメンバーの詳細情報を取得
  const selectedMemberDetails = getSelectedMemberDetails(selectedMemberKeys);

  console.log(`Selected member details:`, selectedMemberDetails);

  // プロジェクトメンバーカードに表示
  await displaySelectedMembers(selectedMemberDetails);
}

// 選択されたメンバーの詳細情報を取得
function getSelectedMemberDetails(selectedMemberKeys) {
  const memberDetails = [];

  if (!currentMemberData || !currentMemberData.teams) {
    return memberDetails;
  }

  selectedMemberKeys.forEach(memberKey => {
    const [teamName, groupName, memberNumber] = memberKey.split('-');
    const team = currentMemberData.teams[teamName];
    const group = team?.groups?.[groupName];
    const member = group?.members?.find(m => m.number === memberNumber);

    if (member) {
      memberDetails.push(member);
    }
  });

  return memberDetails;
}

// 選択されたメンバーを表示
async function displaySelectedMembers(selectedMemberDetails) {
  const membersListContainer = document.getElementById("membersList");
  const memberStatusContainer = document.getElementById("memberStatus");

  if (!membersListContainer) {
    return;
  }

  if (selectedMemberDetails.length === 0) {
    membersListContainer.innerHTML = '<div class="members-empty">選択されたメンバーがありません</div>';
    if (memberStatusContainer) {
      memberStatusContainer.textContent = "";
    }
    return;
  }

  // 現在のプロジェクト名を取得
  const currentProjectName = await getCurrentProjectName();

  // メンバーサマリー情報（プロジェクト名を含む）
  const keyHolderCount = selectedMemberDetails.filter(member => member.isKeyHolder).length;
  const summaryHtml = `
    <div class="member-summary">
      <div style="margin-bottom: 8px;">
        <strong style="color: var(--accent);">プロジェクト: ${currentProjectName}</strong>
      </div>
      <span>選択メンバー数: <span class="member-count">${selectedMemberDetails.length}名</span></span>
      <span>鍵保有者: <span class="member-count">${keyHolderCount}名</span></span>
    </div>
  `;

  // グループ別に整理
  const membersByGroup = {};
  selectedMemberDetails.forEach(member => {
    if (!membersByGroup[member.group]) {
      membersByGroup[member.group] = [];
    }
    membersByGroup[member.group].push(member);
  });

  // メンバーリストのHTML生成（グループごと）
  let membersHtml = '';
  Object.keys(membersByGroup).forEach(groupName => {
    membersHtml += `<div class="group-header">${groupName}</div>`;
    membersByGroup[groupName].forEach(member => {
      const keyHolderBadge = member.isKeyHolder
        ? '<span class="key-holder-badge">鍵保有者</span>'
        : '';

      membersHtml += `
        <div class="member-item">
          <div class="member-info">
            <span class="member-number">${member.number}</span>
            <span class="member-name">${member.name}</span>
          </div>
          <div class="member-badges">
            ${keyHolderBadge}
          </div>
        </div>
      `;
    });
  });

  membersListContainer.innerHTML = summaryHtml + membersHtml;

  // ステータス更新
  if (memberStatusContainer) {
    const updateTime = new Date().toLocaleString("ja-JP");
    memberStatusContainer.textContent = `確定済み: ${updateTime}`;
  }

  toggleProjectMemberCard(true);
}

// ===== 全チームメンバー表示機能 =====

// 全チームメンバーのタブを生成・表示
function displayAllMemberTabs(teamName, memberData) {
  const allProjectTabsContainer = document.getElementById("allProjectTabs");
  const allMembersListContainer = document.getElementById("allMembersList");

  if (!allProjectTabsContainer || !allMembersListContainer || !memberData || !memberData.teams) {
    return;
  }

  const team = memberData.teams[teamName];
  if (!team || !team.groups) {
    allProjectTabsContainer.style.display = "none";
    return;
  }

  // タブボタンを生成
  allProjectTabsContainer.innerHTML = "";
  const groupNames = Object.keys(team.groups);

  if (groupNames.length <= 1) {
    // 1つ以下のグループの場合はタブを非表示
    allProjectTabsContainer.style.display = "none";
    if (groupNames.length === 1) {
      displayAllGroupMembers(teamName, groupNames[0], memberData);
    }
    return;
  }

  // 複数グループの場合はタブを表示
  allProjectTabsContainer.style.display = "flex";

  groupNames.forEach((groupName, index) => {
    const tabButton = document.createElement("button");
    tabButton.className = `project-tab ${index === 0 ? "active" : ""}`;
    tabButton.textContent = `${teamName}${groupName}`;
    tabButton.dataset.team = teamName;
    tabButton.dataset.group = groupName;

    tabButton.addEventListener("click", () => {
      // 全てのタブのアクティブ状態をリセット
      document.querySelectorAll("#allProjectTabs .project-tab").forEach(tab => {
        tab.classList.remove("active");
      });

      // クリックされたタブをアクティブに
      tabButton.classList.add("active");

      // 対応するグループのメンバーを表示
      displayAllGroupMembers(teamName, groupName, memberData);
    });

    allProjectTabsContainer.appendChild(tabButton);
  });

  // 最初のタブのメンバーを表示
  if (groupNames.length > 0) {
    displayAllGroupMembers(teamName, groupNames[0], memberData);
  }
}

// 全メンバーのグループ表示
function displayAllGroupMembers(teamName, groupName, memberData) {
  const allMembersListContainer = document.getElementById("allMembersList");
  const allMemberStatusContainer = document.getElementById("allMemberStatus");

  if (!allMembersListContainer) {
    return;
  }

  const team = memberData.teams?.[teamName];
  const group = team?.groups?.[groupName];

  if (!group || !group.members || group.members.length === 0) {
    allMembersListContainer.innerHTML = '<div class="members-empty">メンバーが見つかりません</div>';
    if (allMemberStatusContainer) {
      allMemberStatusContainer.textContent = "";
    }
    return;
  }

  // メンバーサマリー情報
  const keyHolderCount = group.members.filter(member => member.isKeyHolder).length;
  const summaryHtml = `
    <div class="member-summary">
      <span>メンバー数: <span class="member-count">${group.members.length}名</span></span>
      <span>鍵保有者: <span class="member-count">${keyHolderCount}名</span></span>
    </div>
  `;

  // メンバーリストのHTML生成
  const membersHtml = group.members.map(member => {
    const keyHolderBadge = member.isKeyHolder
      ? '<span class="key-holder-badge">鍵保有者</span>'
      : '';

    return `
      <div class="member-item">
        <div class="member-info">
          <span class="member-number">${member.number}</span>
          <span class="member-name">${member.name}</span>
        </div>
        <div class="member-badges">
          ${keyHolderBadge}
        </div>
      </div>
    `;
  }).join("");

  allMembersListContainer.innerHTML = summaryHtml + membersHtml;

  // ステータス更新
  if (allMemberStatusContainer) {
    const updateTime = new Date().toLocaleString("ja-JP");
    allMemberStatusContainer.textContent = `最終更新: ${updateTime}`;
  }
}

// ===== メンバー選択データの保存・読み込み =====

// メンバー選択データを保存
async function saveMemberSelections() {
  try {
    await chrome.storage.sync.set({
      selectedMembers: selectedMembers
    });
    console.log('メンバー選択データを保存しました', selectedMembers);
  } catch (error) {
    console.error('メンバー選択データの保存エラー:', error);
  }
}

// メンバー選択データを読み込み
async function loadMemberSelections() {
  try {
    const saved = await chrome.storage.sync.get(['selectedMembers']);
    selectedMembers = saved.selectedMembers || {};
    console.log('メンバー選択データを読み込みました', selectedMembers);
  } catch (error) {
    console.error('メンバー選択データの読み込みエラー:', error);
    selectedMembers = {};
  }
}

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
  
  // 表示設定関連の要素
  const enableStartupAnimationInput = document.getElementById("enableStartupAnimation"); // 起動アニメーション有効チェックボックス
  const saveDisplaySettingsBtn = document.getElementById("saveDisplaySettings");  // 表示設定保存ボタン
  const displaySettingsStatus = document.getElementById("displaySettingsStatus");  // 表示設定保存ステータス表示

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

  // プロジェクトメンバー関連要素
  const refreshMembersBtn = document.getElementById("refreshMembers");        // メンバー情報再読み込みボタン

  // メンバー選択関連要素
  const selectAllMembersBtn = document.getElementById("selectAllMembers");    // 全選択ボタン
  const clearAllMembersBtn = document.getElementById("clearAllMembers");      // 全解除ボタン
  const confirmMemberSelectionBtn = document.getElementById("confirmMemberSelection"); // 確定ボタン

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

  // 表示設定の初期化
  enableStartupAnimationInput.checked = data.enableStartupAnimation;         // 起動アニメーション有効状態の設定

  // 起動アニメーション制御
  const splashScreen = document.getElementById("splash");
  if (!data.enableStartupAnimation && splashScreen) {
    splashScreen.style.display = "none";
  }

  // 通知詳細設定の有効/無効状態を設定
  toggleNotificationSettings(data.enableNotifications);

  // カスタムセレクトのグローバルイベントリスナー設定
  setupCustomSelectEventListeners();

  // 「所属メンバー」ボタンのイベントリスナー
  const showProjectMembersBtn = document.getElementById("showProjectMembers");
  if (showProjectMembersBtn) {
    showProjectMembersBtn.addEventListener("click", async () => {
      const memberArea = document.getElementById("activeProjectMembers");
      const isCurrentlyVisible = memberArea && memberArea.style.display !== "none";

      if (isCurrentlyVisible) {
        // 現在表示されている場合は閉じる
        toggleProjectMemberCard(false);
      } else {
        // 非表示の場合は開く
        // 現在選択されているプロジェクトの所属メンバーを表示
        const currentProjectKey = await getCurrentProjectKey();
        if (selectedMembers[currentProjectKey] && selectedMembers[currentProjectKey].length > 0) {
          // 既に選択されたメンバーがある場合は表示
          await updateProjectMemberDisplay();
          toggleProjectMemberCard(true);
        } else {
          // メンバーが選択されていない場合はメッセージを表示
          toggleProjectMemberCard(true);
          const membersListContainer = document.getElementById("membersList");
          if (membersListContainer) {
            const currentProjectName = await getCurrentProjectName();
            membersListContainer.innerHTML = `
              <div class="members-empty">
                <p style="margin: 8px 0;">プロジェクト「${currentProjectName}」にメンバーが設定されていません。</p>
                <button id="startMemberEditFromEmpty" class="btn small" style="background: var(--accent); color: white; margin-top: 8px;">メンバーを設定する</button>
              </div>
            `;

            // 「メンバーを設定する」ボタンのイベントリスナーを追加
            const startEditBtn = document.getElementById("startMemberEditFromEmpty");
            if (startEditBtn) {
              startEditBtn.addEventListener("click", () => {
                startMemberEditMode();
              });
            }
          }
        }
      }
    });
  }

  // メンバー再読み込みボタンのイベントリスナー
  if (refreshMembersBtn) {
    refreshMembersBtn.addEventListener("click", async () => {
      await loadAndDisplayMembers(true); // 強制リフレッシュ
      // リフレッシュ後にチーム選択肢を更新
      updateCustomSelects();
    });
  }

  // 「メンバー編集」ボタンのイベントリスナー
  const editProjectMembersBtn = document.getElementById("editProjectMembers");
  if (editProjectMembersBtn) {
    editProjectMembersBtn.addEventListener("click", () => {
      startMemberEditMode();
    });
  }

  // 全メンバー再読み込みボタンのイベントリスナー
  const refreshAllMembersBtn = document.getElementById("refreshAllMembers");
  if (refreshAllMembersBtn) {
    refreshAllMembersBtn.addEventListener("click", async () => {
      await loadAndDisplayMembers(true); // 強制リフレッシュ
      // リフレッシュ後に全メンバー表示を更新
      if (currentSelectedTeam && currentMemberData && currentMemberData.teams[currentSelectedTeam]) {
        displayAllMemberTabs(currentSelectedTeam, currentMemberData);
      }
      updateCustomSelects();
    });
  }

  // メンバー選択関連のイベントリスナー
  if (selectAllMembersBtn) {
    selectAllMembersBtn.addEventListener("click", () => {
      selectAllMembersInCurrentGroup().catch(error => {
        console.error('Error selecting all members:', error);
      });
    });
  }

  if (clearAllMembersBtn) {
    clearAllMembersBtn.addEventListener("click", () => {
      clearAllMembersInCurrentGroup().catch(error => {
        console.error('Error clearing all members:', error);
      });
    });
  }

  if (confirmMemberSelectionBtn) {
    confirmMemberSelectionBtn.addEventListener("click", () => {
      confirmMemberSelection().catch(error => {
        console.error('Error confirming member selection:', error);
      });
    });
  }

  // モーダル関連のイベントリスナー
  const closeMemberEditModalBtn = document.getElementById("closeMemberEditModal");
  if (closeMemberEditModalBtn) {
    closeMemberEditModalBtn.addEventListener("click", () => {
      hideMemberEditModal();
    });
  }

  const selectAllMembersModalBtn = document.getElementById("selectAllMembersModal");
  if (selectAllMembersModalBtn) {
    selectAllMembersModalBtn.addEventListener("click", () => {
      selectAllMembersInCurrentGroupModal().catch(error => {
        console.error('Error selecting all members in modal:', error);
      });
    });
  }

  const clearAllMembersModalBtn = document.getElementById("clearAllMembersModal");
  if (clearAllMembersModalBtn) {
    clearAllMembersModalBtn.addEventListener("click", () => {
      clearAllMembersInCurrentGroupModal().catch(error => {
        console.error('Error clearing all members in modal:', error);
      });
    });
  }

  const confirmMemberSelectionModalBtn = document.getElementById("confirmMemberSelectionModal");
  if (confirmMemberSelectionModalBtn) {
    confirmMemberSelectionModalBtn.addEventListener("click", () => {
      confirmMemberSelectionModal().catch(error => {
        console.error('Error confirming member selection in modal:', error);
      });
    });
  }

  // モーダル背景クリックで閉じる
  const memberEditModal = document.getElementById("memberEditModal");
  if (memberEditModal) {
    memberEditModal.addEventListener("click", (e) => {
      if (e.target === memberEditModal) {
        hideMemberEditModal();
      }
    });
  }

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
    // Team optionsをスプレッドシートのチーム情報と連携
    // 既存の設定チームと、スプレッドシートから取得できるチームを統合
    const baseTeamOptions = data.teams.map(t => ({ value: t.id, text: t.name }));

    // スプレッドシートのチーム情報を追加（利用可能な場合）
    let teamOptions = [...baseTeamOptions];
    if (currentMemberData && currentMemberData.teams) {
      const spreadsheetTeams = Object.keys(currentMemberData.teams);
      for (const spreadsheetTeam of spreadsheetTeams) {
        // 既存のチームオプションに同じ名前がない場合のみ追加
        if (!teamOptions.some(option => option.text === spreadsheetTeam)) {
          teamOptions.push({
            value: crypto.randomUUID(),
            text: spreadsheetTeam
          });
        }
      }
    }

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

        // メンバー表示を更新
        const selectedTeamOption = teamOptions.find(option => option.value === value);
        if (selectedTeamOption) {
          updateMemberDisplayForTeam(selectedTeamOption.text).catch(error => {
            console.error('Error updating member display:', error);
          });

          // 保存された選択メンバーがある場合は表示を更新
          setTimeout(async () => {
            const currentProjectKey = await getCurrentProjectKey();
            if (selectedMembers[currentProjectKey] && selectedMembers[currentProjectKey].length > 0) {
              await updateProjectMemberDisplay();
            }
          }, 100);
        }
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

  // メンバー選択データの読み込み
  await loadMemberSelections();

  // 初期表示時はメンバー関連UIを非表示にする
  toggleProjectMemberCard(false);
  toggleMemberSelectionCard(false);

  // 初期メンバーデータ読み込み
  const initialTeam = data.teams.find((t) => t.id === selectedTeamId);
  if (initialTeam) {
    currentSelectedTeam = initialTeam.name;
    await loadAndDisplayMembers();

    // メンバーデータ読み込み完了後にチーム選択肢を更新
    updateCustomSelects();

    // 全チームメンバーを初期表示する
    if (currentSelectedTeam && currentMemberData && currentMemberData.teams[currentSelectedTeam]) {
      displayAllMemberTabs(currentSelectedTeam, currentMemberData);
    }

    // 保存された選択メンバーがある場合は所属メンバーを表示状態にする
    const currentProjectKey = await getCurrentProjectKey();
    if (selectedMembers[currentProjectKey] && selectedMembers[currentProjectKey].length > 0) {
      // 所属メンバーが設定されている場合は自動では表示しない
      // ユーザーが「所属メンバー」ボタンを押したときに表示する
    }
  }

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
  teamSelect.addEventListener("change", async () => {
    selectedTeamId = teamSelect.value;
    const team = data.teams.find((t) => t.id === selectedTeamId);
    selectedProjectId = team?.projects?.[0]?.id;
    fillProjectSelect(projectSelect, team, selectedProjectId);
    updateCustomSelects();
    refreshSwitchVisibility();

    // チーム変更時にメンバー表示を更新
    if (team) {
      await updateMemberDisplayForTeam(team.name).catch(error => {
        console.error('Error updating member display for team:', error);
      });
    }
  });

  projectSelect.addEventListener("change", async () => {
    selectedProjectId = projectSelect.value;
    updateProjectCustomSelect();
    refreshSwitchVisibility();

    // プロジェクト変更時に、そのプロジェクトのメンバー選択状況を表示
    await updateProjectMemberDisplay();
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
    // 現在選択されているチームIDを取得
    const currentSelectedTeamId = teamSelect.value || selectedTeamId;
    let team = data.teams.find((t) => t.id === currentSelectedTeamId);

    // チームが見つからない場合、スプレッドシートチームの可能性があるので新しく作成
    if (!team) {
      // カスタムセレクトから現在選択中のチーム名を取得
      const teamDisplayText = document.getElementById("teamDisplayText");
      const teamName = teamDisplayText ? teamDisplayText.textContent : "新しいチーム";

      // スプレッドシートチームの場合、data.teamsに新しいチームエントリを作成
      team = {
        id: currentSelectedTeamId,
        name: teamName,
        projects: []
      };
      data.teams.push(team);
    }

    const pj = prompt(`チーム「${team.name}」に追加するプロジェクト名`);
    if (!pj) return;

    const p = { id: crypto.randomUUID(), name: pj };

    // projectsプロパティが存在しない場合は初期化
    if (!team.projects) {
      team.projects = [];
    }

    team.projects.push(p);
    await saveAll(data);

    // 新しく追加したプロジェクトを選択状態に設定
    selectedTeamId = currentSelectedTeamId;
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

  // 表示設定保存ボタンのイベントハンドラー
  saveDisplaySettingsBtn.addEventListener("click", async () => {
    const enableStartupAnimation = enableStartupAnimationInput.checked;

    // データ更新
    data.enableStartupAnimation = enableStartupAnimation;

    try {
      // 設定保存
      await saveAll(data);
      
      // 保存完了表示
      displaySettingsStatus.textContent = "保存しました";
      displaySettingsStatus.style.color = "#17c964";
      setTimeout(() => { 
        displaySettingsStatus.textContent = ""; 
        displaySettingsStatus.style.color = "";
      }, 2500);

    } catch (error) {
      console.error("表示設定の保存に失敗しました:", error);
      displaySettingsStatus.textContent = "保存に失敗しました。再度お試しください。";
      displaySettingsStatus.style.color = "#f31260";
      setTimeout(() => { displaySettingsStatus.textContent = ""; displaySettingsStatus.style.color = ""; }, 3000);
    }
  });

  // 通知テスト機能（デバッグ用）
  // Ctrl+Shift+T で出勤前通知テスト、Ctrl+Shift+E で退勤通知テスト、Ctrl+Shift+A でアラーム確認
  document.addEventListener("keydown", async (event) => {
    if (event.ctrlKey && event.shiftKey) {
      if (event.key === 'A') {
        event.preventDefault();
        console.log("Checking current alarms...");
        try {
          const response = await chrome.runtime.sendMessage({
            type: "CHECK_ALARMS"
          });
          console.log("Current alarms response:", response);
          if (response.ok) {
            console.table(response.alarms);
            alert(`現在のアラーム数: ${response.alarms.length}\n詳細はコンソールを確認してください`);
          }
        } catch (error) {
          console.error("Alarm check failed:", error);
        }
      } else if (event.key === 'T') {
        event.preventDefault();
        console.log("Testing pre-work notification...");
        try {
          await chrome.runtime.sendMessage({
            type: "TEST_NOTIFICATION",
            notificationType: "pre-work",
            preWorkNotifyMin: data.preWorkNotifyMin || 15
          });
          console.log("Pre-work notification test sent");
        } catch (error) {
          console.error("Pre-work notification test failed:", error);
        }
      } else if (event.key === 'E') {
        event.preventDefault();
        console.log("Testing work-end notification...");
        try {
          await chrome.runtime.sendMessage({
            type: "TEST_NOTIFICATION",
            notificationType: "work-end"
          });
          console.log("Work-end notification test sent");
        } catch (error) {
          console.error("Work-end notification test failed:", error);
        }
      } else if (event.key === 'S') {
        event.preventDefault();
        console.log("Testing 30-second alarm...");
        try {
          await chrome.runtime.sendMessage({
            type: "TEST_NOTIFICATION",
            notificationType: "alarm-test"
          });
          console.log("30-second alarm test created - wait 30 seconds for notification");
          alert("30秒後にテスト通知が表示されます");
        } catch (error) {
          console.error("30-second alarm test failed:", error);
        }
      }
    }
  });

  // 初期化時に通知スケジュールを設定（重要：デフォルト設定や保存された設定で通知を有効化）
  if (data.enableNotifications && data.workStart && data.workEnd) {
    try {
      await chrome.runtime.sendMessage({
        type: "UPDATE_NOTIFICATION_SCHEDULE",
        workStart: data.workStart,
        workEnd: data.workEnd,
        enableNotifications: data.enableNotifications,
        enablePreWorkNotification: data.enablePreWorkNotification,
        enableWorkEndNotification: data.enableWorkEndNotification,
        preWorkNotifyMin: data.preWorkNotifyMin,
        enableWorkDays: data.enableWorkDays,
      });
      console.log("Initial notification schedule set successfully");
    } catch (error) {
      console.error("Failed to set initial notification schedule:", error);
    }
  }
});
