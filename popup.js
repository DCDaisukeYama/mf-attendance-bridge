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
    breakStart: "13:00",  // デフォルト休憩開始時刻
    breakEnd: "14:00",    // デフォルト休憩終了時刻
  };
}

// 全設定データ読み込み関数
// Chrome同期ストレージからチーム・プロジェクト・休憩設定を取得
async function loadAll() {
  const saved = await chrome.storage.sync.get([
    KEY.TEAMS,
    KEY.ACTIVE_TEAM,
    KEY.ACTIVE_PROJ,
    KEY.BREAK_START,
    KEY.BREAK_END,
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
  });
}

// アクティブなチーム・プロジェクト検索関数
// 指定されたIDに基づいて現在選択中のチームとプロジェクトを取得
function findActive(teams, tid, pid) {
  const t = teams.find((x) => x.id === tid) || teams[0]; // チームが見つからない場合は最初のチームを使用
  const p = t?.projects?.find((x) => x.id === pid) || t?.projects?.[0]; // プロジェクトが見つからない場合は最初のプロジェクトを使用
  return { team: t, project: p };
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
// 現在選択中のチーム/プロジェクト名をUIに反映
function updateActiveLabel(el, data) {
  const { team, project } = findActive(
    data.teams,
    data.activeTeamId,
    data.activeProjectId
  );
  el.textContent =
    team && project ? `${team.name} / ${project.name}` : "未選択";
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
  updateActiveLabel(activeLabel, data);                                      // アクティブプロジェクト表示更新
  breakStartInput.value = data.breakStart;                                   // 休憩開始時刻の設定
  breakEndInput.value = data.breakEnd;                                       // 休憩終了時刻の設定

  // カスタムセレクトのグローバルイベントリスナー設定
  setupCustomSelectEventListeners();

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
      (value) => {
        selectedProjectId = value;
        projectSelect.value = value;
        refreshSwitchVisibility();
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
    updateActiveLabel(activeLabel, data);
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
      } catch (error) {
        console.error("Failed to fetch sheet headers:", error);
        headers = [];
      }
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
});
