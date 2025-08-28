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

function render(listRoot, data) {
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
      const isActive =
        data.activeTeamId === team.id && data.activeProjectId === p.id;
      const row = document.createElement("div");
      row.className = "proj";
      row.dataset.pid = p.id;
      row.innerHTML = `
        <div class="left">
          <input type="radio" name="proj" ${isActive ? "checked" : ""} />
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
    pageTitle: "project switch",
    team: teamName,
    project: projName,
  };
  chrome.runtime.sendMessage({ type: "MF_BRIDGE_EVENT", payload });
}

document.addEventListener("DOMContentLoaded", async () => {
  let data = await loadAll();

  const list = document.getElementById("list");
  const activeLabel = document.getElementById("activeLabel");
  const switchBtn = document.getElementById("switchBtn");
  render(list, data);
  updateActiveLabel(activeLabel, data);

  // 追加ボタン
  document.getElementById("addTeam").addEventListener("click", async () => {
    const name = prompt("追加するチーム名");
    if (!name) return;
    data.teams.push({ id: crypto.randomUUID(), name, projects: [] });
    await saveAll(data);
    render(list, data);
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
    render(list, data);
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
      data.activeTeamId = tid;
      data.activeProjectId = pid;
      await saveAll(data);
      updateActiveLabel(activeLabel, data);
      render(list, data);
      return;
    }

    // 名前変更
    if (e.target.classList.contains("rename-team")) {
      const nm = prompt("チーム名を変更", team.name);
      if (nm) {
        team.name = nm;
        await saveAll(data);
        render(list, data);
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
        render(list, data);
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
      await saveAll(data);
      render(list, data);
      updateActiveLabel(activeLabel, data);
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
      await saveAll(data);
      render(list, data);
      updateActiveLabel(activeLabel, data);
      return;
    }
  });

  // 切替ボタン：現在選択で switch を記録 & bridge.html へ
  switchBtn.addEventListener("click", async () => {
    const { team, project } = findActive(
      data.teams,
      data.activeTeamId,
      data.activeProjectId
    );
    if (!team || !project) return;
    sendProjectSwitch(team.name, project.name);
    window.close(); // ポップアップは閉じる
  });
});
