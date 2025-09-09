const KEY = {
  TEAMS: "teams",
  ACTIVE_TEAM: "activeTeamId",
  ACTIVE_PROJ: "activeProjectId",
  BREAK_START: "breakStart",
  BREAK_END: "breakEnd",
};

function defaultData() {
  const tid = crypto.randomUUID();
  const pid = crypto.randomUUID();
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
    breakStart: "13:00",
    breakEnd: "14:00",
  };
}

async function loadAll() {
  const saved = await chrome.storage.sync.get([
    KEY.TEAMS,
    KEY.ACTIVE_TEAM,
    KEY.ACTIVE_PROJ,
    KEY.BREAK_START,
    KEY.BREAK_END,
  ]);
  if (!saved.teams || !Array.isArray(saved.teams) || saved.teams.length === 0) {
    const def = defaultData();
    await chrome.storage.sync.set(def);
    return def;
  }
  return {
    teams: saved.teams,
    activeTeamId: saved.activeTeamId,
    activeProjectId: saved.activeProjectId,
    breakStart: saved.breakStart || "13:00",
    breakEnd: saved.breakEnd || "14:00",
  };
}

async function saveAll(data) {
  await chrome.storage.sync.set({
    [KEY.TEAMS]: data.teams,
    [KEY.ACTIVE_TEAM]: data.activeTeamId,
    [KEY.ACTIVE_PROJ]: data.activeProjectId,
    [KEY.BREAK_START]: data.breakStart,
    [KEY.BREAK_END]: data.breakEnd,
  });
}

function findActive(teams, tid, pid) {
  const t = teams.find((x) => x.id === tid) || teams[0];
  const p = t?.projects?.find((x) => x.id === pid) || t?.projects?.[0];
  return { team: t, project: p };
}

function ensureTeam(data, name) {
  let t = data.teams.find((x) => x.name === name);
  if (!t) {
    t = { id: crypto.randomUUID(), name, projects: [] };
    data.teams.push(t);
  }
  return t;
}
function ensureProject(team, pjName) {
  let p = team.projects.find((x) => x.name === pjName);
  if (!p) {
    p = { id: crypto.randomUUID(), name: pjName };
    team.projects.push(p);
  }
  return p;
}

// ---- Sheet helpers ----
function extractSheetId(url) {
  const m = String(url || "").match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}
function monthSheetName(d = new Date()) {
  const y = d.getFullYear(),
    m = d.getMonth() + 1;
  return `${y}年${m}月`;
}
async function fetchHeaderBR1Csv(ssUrl, sheetName) {
  const id = extractSheetId(ssUrl);
  if (!id) return [];
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    sheetName
  )}&range=B1:R1`;
  const res = await fetch(csvUrl);
  if (!res.ok) return [];
  const text = (await res.text()).trim();
  return text
    .split(",")
    .map((s) => s.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}

// ---- UI builders ----
function fillTeamSelect(sel, teams, selectedId) {
  sel.innerHTML = "";
  for (const t of teams) {
    const opt = new Option(t.name, t.id, false, t.id === selectedId);
    sel.add(opt);
  }
}
function fillProjectSelect(sel, team, selectedPid) {
  sel.innerHTML = "";
  (team?.projects || []).forEach((p) => {
    sel.add(new Option(p.name, p.id, false, p.id === selectedPid));
  });
}
function updateActiveLabel(el, data) {
  const { team, project } = findActive(
    data.teams,
    data.activeTeamId,
    data.activeProjectId
  );
  el.textContent =
    team && project ? `${team.name} / ${project.name}` : "未選択";
}

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

// 勤怠ステータスを判定する関数
function getAttendanceStatus(logs, breakStart, breakEnd) {
  if (!logs || logs.length === 0) {
    return { status: "off", text: "未出勤", showShortcut: true };
  }

  // 最新のログを時系列順に並び替え
  const sortedLogs = [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const latestLog = sortedLogs[sortedLogs.length - 1];

  // 現在時刻
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 休憩時間チェック
  const isBreakTime = breakStart && breakEnd && currentTime >= breakStart && currentTime <= breakEnd;

  if (latestLog.action === "clock_in") {
    if (isBreakTime) {
      return { status: "break", text: "休憩", showShortcut: false };
    }
    return { status: "working", text: "出勤中", showShortcut: false };
  } else if (latestLog.action === "clock_out") {
    return { status: "off", text: "退勤", showShortcut: true };
  } else {
    // project_switchの場合、その前の出退勤状況を確認
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

// ステータス表示を更新する関数
function updateAttendanceStatus(statusEl, shortcutBtn, logs, breakStart, breakEnd) {
  const statusInfo = getAttendanceStatus(logs, breakStart, breakEnd);
  
  // ステータステキストと点を更新
  statusEl.innerHTML = `
    <span class="status-dot ${statusInfo.status}"></span>
    <span class="status-text">${statusInfo.text}</span>
  `;

  // ショートカットボタンの表示/非表示
  shortcutBtn.style.display = statusInfo.showShortcut ? "inline-flex" : "none";
}

// localStorageから勤怠ログを読み込む関数
function loadAttendanceLogs() {
  try {
    return JSON.parse(localStorage.getItem("attendanceLogs") || "[]");
  } catch {
    return [];
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Splash (open only)
  const splash = document.getElementById("splash");
  // after animation end (2.4s + 0.6s fade ≒ 3.0s), remove node to reduce paint cost
  setTimeout(() => splash?.remove(), 3000);

  let data = await loadAll();

  // Elements
  const activeLabel = document.getElementById("activeLabel");
  const switchBtn = document.getElementById("switchBtn");
  const teamSelect = document.getElementById("teamSelect");
  const projectSelect = document.getElementById("projectSelect");
  const sheetSelect = document.getElementById("sheetSelect");
  const sheetMonth = document.getElementById("sheetMonth");
  const refreshSheet = document.getElementById("refreshSheet");
  const addTeamBtn = document.getElementById("addTeam");
  const addProjBtn = document.getElementById("addProject");
  const breakStartInput = document.getElementById("breakStart");
  const breakEndInput = document.getElementById("breakEnd");
  const saveBreakBtn = document.getElementById("saveBreakTime");
  const breakStatus = document.getElementById("breakStatus");

  // ステータス表示要素
  const attendanceStatusEl = document.getElementById("attendanceStatus");
  const clockInShortcutBtn = document.getElementById("clockInShortcut");

  // State for tentative selection (show switch only when different)
  let selectedTeamId = data.activeTeamId;
  let selectedProjectId = data.activeProjectId;

  // Init selects
  fillTeamSelect(teamSelect, data.teams, selectedTeamId);
  fillProjectSelect(
    projectSelect,
    data.teams.find((t) => t.id === selectedTeamId),
    selectedProjectId
  );
  updateActiveLabel(activeLabel, data);
  breakStartInput.value = data.breakStart;
  breakEndInput.value = data.breakEnd;

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

  // Team change
  teamSelect.addEventListener("change", () => {
    selectedTeamId = teamSelect.value;
    const team = data.teams.find((t) => t.id === selectedTeamId);
    selectedProjectId = team?.projects?.[0]?.id;
    fillProjectSelect(projectSelect, team, selectedProjectId);
    refreshSwitchVisibility();
  });

  // Project change
  projectSelect.addEventListener("change", () => {
    selectedProjectId = projectSelect.value;
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
    window.close();
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

    if (!sheetMode || !spreadsheetUrl) return;

    const sheet = monthSheetName();
    let headers = (!force && ssHeaderCache && ssHeaderCache[sheet]) || [];

    if (!headers?.length) {
      headers = await fetchHeaderBR1Csv(spreadsheetUrl, sheet);
      const cache = ssHeaderCache || {};
      cache[sheet] = headers;
      await chrome.storage.sync.set({ ssHeaderCache: cache });
    }
    headers.forEach((h) => sheetSelect.add(new Option(h, h)));
    // select changes
    sheetSelect.onchange = async () => {
      const name = sheetSelect.value;
      if (!name) return;
      const team = ensureTeam(data, ssTeam || "所属チーム");
      const pj = ensureProject(team, name);
      await saveAll(data); // persist possible additions

      // reflect in selectors
      selectedTeamId = team.id;
      selectedProjectId = pj.id;

      fillTeamSelect(teamSelect, data.teams, selectedTeamId);
      fillProjectSelect(projectSelect, team, selectedProjectId);
      refreshSwitchVisibility();
    };
  }
  await loadSheetHeaders(false);
  refreshSheet.addEventListener("click", () => loadSheetHeaders(true));

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
