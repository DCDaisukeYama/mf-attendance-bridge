// ===== popup.js =====
const KEY = {
  TEAMS: "teams",
  ACTIVE_TEAM: "activeTeamId",
  ACTIVE_PROJ: "activeProjectId",
};

// 初回用デフォルト（所属チーム/所属プロジェクト）
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
  };
}

async function loadAll() {
  const saved = await chrome.storage.sync.get([
    KEY.TEAMS,
    KEY.ACTIVE_TEAM,
    KEY.ACTIVE_PROJ,
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
  };
}

function findActive(teams, tid, pid) {
  const t = teams.find((x) => x.id === tid) || teams[0];
  const p = t?.projects?.find((x) => x.id === pid) || t?.projects?.[0];
  return { team: t, project: p };
}

function render(listRoot, data, selectedTeamId, selectedProjectId) {
  listRoot.innerHTML = "";
  data.teams.forEach((team) => {
    const teamDiv = document.createElement("div");
    teamDiv.className = "team";
    teamDiv.dataset.tid = team.id;
    teamDiv.innerHTML = `
            <div class="team-head">
                <div class="row">
                    <span class="team-name">${team.name}</span>
                </div>
                <div class="row">
                    <button class="btn ghost rename-team">名称変更</button>
                    <button class="btn ghost danger del-team">削除</button>
                </div>
            </div>
            <div class="projs"></div>
        `;

    const projs = teamDiv.querySelector(".projs");
    team.projects?.forEach((p) => {
      const isSelected = selectedTeamId === team.id && selectedProjectId === p.id;
      const row = document.createElement("div");
      row.className = "proj";
      row.dataset.pid = p.id;
      row.innerHTML = `
                <div class="left">
                    <input type="radio" name="proj" ${
                      isSelected ? "checked" : ""
                    } />
                    <span>${p.name}</span>
                </div>
                <div class="row">
                    <button class="btn ghost rename-proj">名称変更</button>
                    <button class="btn ghost danger del-proj">削除</button>
                </div>
            `;
      projs.appendChild(row);
    });

    listRoot.appendChild(teamDiv);
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

async function saveAll(data) {
  await chrome.storage.sync.set({
    [KEY.TEAMS]: data.teams,
    [KEY.ACTIVE_TEAM]: data.activeTeamId,
    [KEY.ACTIVE_PROJ]: data.activeProjectId,
  });
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

// ===== 追加：スプレッドシート（B1:R1）読み取り & チップ表示 =====
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

document.addEventListener("DOMContentLoaded", async () => {
  let data = await loadAll();
  const list = document.getElementById("list");
  const activeLabel = document.getElementById("activeLabel");
  const switchBtn = document.getElementById("switchBtn");
  
  // 現在の選択状態を追跡するための変数
  let selectedTeamId = data.activeTeamId;
  let selectedProjectId = data.activeProjectId;

  // 切替ボタンの表示状態を更新する関数
  function updateSwitchButtonVisibility() {
    const isDifferent = selectedTeamId !== data.activeTeamId || selectedProjectId !== data.activeProjectId;
    switchBtn.style.display = isDifferent ? 'block' : 'none';
  }

  render(list, data, selectedTeamId, selectedProjectId);
  updateActiveLabel(activeLabel, data);
  updateSwitchButtonVisibility();

  // ====== シートの項目（B1:R1）を表示 ======
  (async () => {
    const { sheetMode, spreadsheetUrl, ssTeam, ssHeaderCache } =
      await chrome.storage.sync.get([
        "sheetMode",
        "spreadsheetUrl",
        "ssTeam",
        "ssHeaderCache",
      ]);

    if (!sheetMode || !spreadsheetUrl) return;

    // セクションを先頭側に差し込む
    const secHost = document.createElement("div");
    secHost.className = "sec";
    secHost.innerHTML = `
            <h2>シートの項目（B1:R1 / ${monthSheetName()}）</h2>
            <div id="ssChips" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px"></div>
        `;

    const firstSec = document.querySelector(".sec");
    document.querySelector(".wrap").insertBefore(secHost, firstSec);

    const sheet = monthSheetName();
    let headers = (ssHeaderCache && ssHeaderCache[sheet]) || [];

    if (headers.length === 0) {
      headers = await fetchHeaderBR1Csv(spreadsheetUrl, sheet);
      const cache = ssHeaderCache || {};
      cache[sheet] = headers;
      await chrome.storage.sync.set({ ssHeaderCache: cache });
    }

    const chips = secHost.querySelector("#ssChips");
    headers.forEach((h) => {
      const b = document.createElement("button");
      b.className = "btn";
      b.textContent = h;
      b.title = "クリックでこのPJを選択（なければ追加）";
      b.onclick = async () => {
        const team = ensureTeam(data, ssTeam || "所属チーム");
        const pj = ensureProject(team, h);
        selectedTeamId = team.id;
        selectedProjectId = pj.id;
        render(list, data, selectedTeamId, selectedProjectId);
        updateActiveLabel(activeLabel, data);
        updateSwitchButtonVisibility();
      };
      chips.appendChild(b);
    });
  })();

  // 追加ボタン
  document.getElementById("addTeam").addEventListener("click", async () => {
    const name = prompt("追加するチーム名");
    if (!name) return;

    data.teams.push({ id: crypto.randomUUID(), name, projects: [] });
    await saveAll(data);
    render(list, data, selectedTeamId, selectedProjectId);
  });

  document.getElementById("addProject").addEventListener("click", async () => {
    const teamName = prompt(
      "どのチームに追加しますか？（正確な名称を入力）",
      ""
    );
    const team = data.teams.find((t) => t.name === teamName) || data.teams[0];
    const pj = prompt(`チーム「${team.name}」に追加するプロジェクト名`);
    if (!pj) return;

    team.projects.push({ id: crypto.randomUUID(), name: pj });
    await saveAll(data);
    render(list, data, selectedTeamId, selectedProjectId);
  });

  // リスト委譲
  list.addEventListener("click", async (e) => {
    const teamEl = e.target.closest(".team");
    const projEl = e.target.closest(".proj");
    if (!teamEl) return;

    const tid = teamEl.dataset.tid;
    const team = data.teams.find((t) => t.id === tid);

    // プロジェクト選択（ラジオ or 名前クリック）
    if (
      projEl &&
      (e.target.matches("input[type=radio]") || e.target.closest(".left"))
    ) {
      const pid = projEl.dataset.pid;
      selectedTeamId = tid;
      selectedProjectId = pid;
      render(list, data, selectedTeamId, selectedProjectId);
      updateSwitchButtonVisibility();
      return;
    }

    // 名前変更
    if (e.target.classList.contains("rename-team")) {
      const nm = prompt("チーム名を変更", team.name);
      if (nm) {
        team.name = nm;
        await saveAll(data);
        render(list, data, selectedTeamId, selectedProjectId);
        updateActiveLabel(activeLabel, data);
      }
      return;
    }

    if (projEl && e.target.classList.contains("rename-proj")) {
      const proj = team.projects.find((p) => p.id === projEl.dataset.pid);
      const nm = prompt("プロジェクト名を変更", proj.name);
      if (nm) {
        proj.name = nm;
        await saveAll(data);
        render(list, data, selectedTeamId, selectedProjectId);
        updateActiveLabel(activeLabel, data);
      }
      return;
    }

    // 削除
    if (e.target.classList.contains("del-team")) {
      if (!confirm(`チーム「${team.name}」を削除します。よろしいですか？`))
        return;

      data.teams = data.teams.filter((t) => t.id !== tid);
      const { team: t2, project: p2 } = findActive(
        data.teams,
        data.activeTeamId,
        data.activeProjectId
      );
      data.activeTeamId = t2?.id;
      data.activeProjectId = p2?.id;
      selectedTeamId = t2?.id;
      selectedProjectId = p2?.id;
      await saveAll(data);
      render(list, data, selectedTeamId, selectedProjectId);
      updateActiveLabel(activeLabel, data);
      updateSwitchButtonVisibility();
      return;
    }

    if (projEl && e.target.classList.contains("del-proj")) {
      const proj = team.projects.find((p) => p.id === projEl.dataset.pid);
      if (
        !confirm(`プロジェクト「${proj.name}」を削除します。よろしいですか？`)
      )
        return;

      team.projects = team.projects.filter((p) => p.id !== proj.id);
      const { team: t2, project: p2 } = findActive(
        data.teams,
        data.activeTeamId,
        data.activeProjectId
      );
      data.activeTeamId = t2?.id;
      data.activeProjectId = p2?.id;
      selectedTeamId = t2?.id;
      selectedProjectId = p2?.id;
      await saveAll(data);
      render(list, data, selectedTeamId, selectedProjectId);
      updateActiveLabel(activeLabel, data);
      updateSwitchButtonVisibility();
      return;
    }
  });

  // 切替ボタン：選択したプロジェクトに切替
  switchBtn.addEventListener("click", async () => {
    const { team, project } = findActive(
      data.teams,
      selectedTeamId,
      selectedProjectId
    );
    if (!team || !project) return;

    // データを更新して保存
    data.activeTeamId = selectedTeamId;
    data.activeProjectId = selectedProjectId;
    await saveAll(data);

    // プロジェクト切替を記録
    sendProjectSwitch(team.name, project.name);
    
    // UIを更新
    updateActiveLabel(activeLabel, data);
    updateSwitchButtonVisibility();
    render(list, data, selectedTeamId, selectedProjectId);
    
    window.close(); // ポップアップは閉じる
  });
});
