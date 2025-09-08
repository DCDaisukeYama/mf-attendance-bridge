// 勤怠データを受け取るブリッジページのJavaScript
// URLパラメータから勤怠情報を取得し、ローカル保存とAPI送信を行う

// ---- テーマ管理（Auto / Light / Dark） ----
// ユーザーのシステム設定や手動選択に基づいてダーク/ライトモードを切り替え
(function setupTheme() {
  const root = document.documentElement;
  const media =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
  const getSystemTheme = () => (media && media.matches ? "dark" : "light");

  const MODE_KEY = "bridge_theme_mode"; // "auto" | "light" | "dark"
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
        ? "🌗 自動（システム）"
        : m === "light"
        ? "🌞 ライト"
        : "🌙 ダーク";
    btn.title = "クリックで Auto / Light / Dark を切替";
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
    // 例示URLの動的表示（任意）
    const ex = document.getElementById("exampleUrl");
    if (ex) {
      const protoHost = `${location.protocol}//${location.host}`;
      ex.textContent = `${protoHost}/bridge.html?action=clock_in&timestamp=2025-08-27T00:00:00.000Z&source=moneyforward`;
    }
  });
})();
// API連携用のグローバル設定（必要に応じて有効化）
// window.ATTENDANCE_API_URL = "https://your-domain.example/api/attendance/log"; // 使うときだけ有効化
// window.ATTENDANCE_API_KEY = "YOUR_BEARER_TOKEN";

// ---- ユーティリティ ----
const tzJP = "Asia/Tokyo";
const fmtZero2 = (n) => String(n).padStart(2, "0");
const fmtJP = (iso) => {
  try {
    const d = new Date(iso);
    const y = new Intl.DateTimeFormat("ja-JP", {
      timeZone: tzJP,
      year: "numeric",
    }).format(d);
    const m = new Intl.DateTimeFormat("ja-JP", {
      timeZone: tzJP,
      month: "numeric",
    }).format(d);
    const da = new Intl.DateTimeFormat("ja-JP", {
      timeZone: tzJP,
      day: "numeric",
    }).format(d);
    const hh = new Intl.DateTimeFormat("ja-JP", {
      timeZone: tzJP,
      hour: "2-digit",
      hour12: false,
    }).format(d);
    const mm = new Intl.DateTimeFormat("ja-JP", {
      timeZone: tzJP,
      minute: "2-digit",
    }).format(d);
    const ss = new Intl.DateTimeFormat("ja-JP", {
      timeZone: tzJP,
      second: "2-digit",
    }).format(d);
    return `${y}年${m}月${da}日 ${hh}:${mm}:${ss}`;
  } catch {
    return iso;
  }
};
const fmtUTCshort = (iso) => {
  try {
    const d = new Date(iso);
    const y = d.getUTCFullYear();
    const m = fmtZero2(d.getUTCMonth() + 1);
    const da = fmtZero2(d.getUTCDate());
    const hh = fmtZero2(d.getUTCHours());
    const mm = fmtZero2(d.getUTCMinutes());
    const ss = fmtZero2(d.getUTCSeconds());
    return `${y}-${m}-${da} ${hh}:${mm}:${ss} UTC`;
  } catch {
    return iso;
  }
};
const cellDateHTML = (iso) =>
  `<span class="dt">${fmtJP(iso)}</span><span class="utc">${fmtUTCshort(
    iso
  )}</span>`;

function loadLogs() {
  try {
    return JSON.parse(localStorage.getItem("attendanceLogs") || "[]");
  } catch {
    return [];
  }
}
// 勤怠ログをlocalStorageに保存
function saveLogs(logs) {
  localStorage.setItem("attendanceLogs", JSON.stringify(logs));
}
// 設定されたAPIエンドポイントに勤怠データをPOST送信
async function postAPI(payload) {
  if (!window.ATTENDANCE_API_URL) return { ok: false, skipped: true };
  try {
    const res = await fetch(window.ATTENDANCE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(window.ATTENDANCE_API_KEY
          ? { Authorization: `Bearer ${window.ATTENDANCE_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
// CSVエクスポート用の文字列エスケープ処理
function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
}
// action を日本語に変換する関数
function translateAction(action) {
  switch (action) {
    case "clock_in":
      return "出勤";
    case "clock_out":
      return "退勤";
    case "project_switch":
      return "切替";
    default:
      return action;
  }
}

// page を日本語に変換する関数
function translatePage(page) {
  if (page === "project switch") {
    return "プロジェクト切替";
  }
  return page || "";
}

// 勤怠ログをCSVファイルとしてエクスポート
function exportCSV(rows, filename = "attendance_logs.csv") {
  const header = [
    "id",
    "action",
    "timestamp",
    "timestamp_jst",
    "source",
    "team",
    "project",
    "page",
    "ref",
  ];
  const lines = [header.join(",")].concat(
    rows.map((r) =>
      [
        r.id,
        translateAction(r.action),
        r.timestamp,
        fmtJP(r.timestamp),
        r.source || "",
        r.team || "",
        r.project || "",
        translatePage(r.page),
        r.ref || "",
      ]
        .map(csvEscape)
        .join(",")
    )
  );
  const blob = new Blob(["\ufeff" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// 休憩時間の重複する時間を計算（ミリ秒）
function calculateBreakOverlap(inTime, outTime, breakStart, breakEnd) {
  if (!breakStart || !breakEnd) return 0;

  // 日付部分を統一して時刻のみで比較
  const inDate = new Date(inTime);
  const outDate = new Date(outTime);

  // 同一日の場合のみ休憩時間を考慮
  if (inDate.toDateString() !== outDate.toDateString()) return 0;

  // JST（UTC+9）での時刻を取得
  const jstOffset = 9 * 60 * 60 * 1000;
  const inJst = new Date(inDate.getTime() + jstOffset);
  const outJst = new Date(outDate.getTime() + jstOffset);

  // 時刻文字列をパース（HH:MM形式）
  const [breakStartHour, breakStartMin] = breakStart.split(":").map(Number);
  const [breakEndHour, breakEndMin] = breakEnd.split(":").map(Number);

  // 休憩時間の開始・終了をJSTの日付で作成
  const breakStartJst = new Date(
    inJst.getFullYear(),
    inJst.getMonth(),
    inJst.getDate(),
    breakStartHour,
    breakStartMin
  );
  const breakEndJst = new Date(
    inJst.getFullYear(),
    inJst.getMonth(),
    inJst.getDate(),
    breakEndHour,
    breakEndMin
  );

  // 重複期間を計算
  const overlapStart = Math.max(inJst.getTime(), breakStartJst.getTime());
  const overlapEnd = Math.min(outJst.getTime(), breakEndJst.getTime());

  // 重複がある場合はその時間（ミリ秒）を返す
  return overlapEnd > overlapStart ? overlapEnd - overlapStart : 0;
}

// ---- 労働時間ペア計算 ----
async function buildPairs(logs) {
  // 休憩時間設定を取得
  const breakSettings = await chrome.storage.sync.get([
    "breakStart",
    "breakEnd",
  ]);
  const breakStart = breakSettings.breakStart || "13:00";
  const breakEnd = breakSettings.breakEnd || "14:00";

  const sorted = [...logs].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );
  const inStack = [];
  const pairs = [];
  for (const l of sorted) {
    if (l.action === "clock_in") {
      inStack.push(l);
    } else if (l.action === "clock_out") {
      while (inStack.length) {
        const inLog = inStack.pop();
        const ms = new Date(l.timestamp) - new Date(inLog.timestamp);
        if (ms > 0) {
          // 休憩時間の重複を計算
          const breakOverlapMs = calculateBreakOverlap(
            inLog.timestamp,
            l.timestamp,
            breakStart,
            breakEnd
          );

          // 実労働時間（休憩時間を除外）
          const actualMs = ms - breakOverlapMs;
          const totalMin = Math.floor(actualMs / 60000);
          const quarterUnits = Math.round(actualMs / (15 * 60 * 1000));
          const quarterMin = quarterUnits * 15;
          const quarterHoursStr = formatQuarterHours(quarterUnits);

          pairs.push({
            inLog,
            outLog: l,
            diffMs: ms, // 元の時間
            actualMs, // 休憩時間除外後
            breakOverlapMs, // 休憩時間の重複
            totalMin,
            quarterUnits,
            quarterMin,
            quarterHoursStr,
          });
          break;
        }
      }
    }
  }
  const byOutId = new Map(),
    byInId = new Map();
  for (const p of pairs) {
    byOutId.set(p.outLog.id, p);
    byInId.set(p.inLog.id, p);
  }
  return { pairs, byOutId, byInId };
}
function formatQuarterHours(units) {
  const val = units / 4;
  return Number.isInteger(val)
    ? String(val)
    : val.toFixed(2).replace(/\.?0+$/, "");
}
function formatPreciseHMS(ms, showBreakInfo = false, breakMs = 0) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h}時間`);
  if (m) parts.push(`${m}分`);
  if (sec || parts.length === 0) parts.push(`${sec}秒`);

  let result = parts.join("");

  // 休憩時間の情報も表示する場合
  if (showBreakInfo && breakMs > 0) {
    const breakMin = Math.floor(breakMs / 60000);
    result += ` (休憩${breakMin}分除外)`;
  }

  return result;
}

// ---- 週/月合計（JST基準） ----
const JST_HOUR = 9;
function toJstDate(d) {
  return new Date(d.getTime() + JST_HOUR * 3600 * 1000);
}
function getWeekStartJst(dJst) {
  const dow = dJst.getUTCDay();
  const diffToMon = (dow + 6) % 7;
  const dayStart = Date.UTC(
    dJst.getUTCFullYear(),
    dJst.getUTCMonth(),
    dJst.getUTCDate()
  );
  return new Date(dayStart - diffToMon * 24 * 3600 * 1000);
}
function getMonthStartJst(dJst) {
  return new Date(Date.UTC(dJst.getUTCFullYear(), dJst.getUTCMonth(), 1));
}
function computeTotals(pairs) {
  const nowJst = toJstDate(new Date());
  const weekStart = getWeekStartJst(nowJst);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000);
  const monthStart = getMonthStartJst(nowJst);
  const monthEnd = new Date(
    Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth() + 1, 1)
  );
  let weekPreciseMs = 0,
    weekRoundedMin = 0,
    monthPreciseMs = 0,
    monthRoundedMin = 0;
  for (const p of pairs) {
    const outJst = toJstDate(new Date(p.outLog.timestamp));
    if (outJst >= weekStart && outJst < weekEnd) {
      weekPreciseMs += p.actualMs || p.diffMs; // 休憩時間除外後の時間を使用
      weekRoundedMin += p.quarterMin;
    }
    if (outJst >= monthStart && outJst < monthEnd) {
      monthPreciseMs += p.actualMs || p.diffMs; // 休憩時間除外後の時間を使用
      monthRoundedMin += p.quarterMin;
    }
  }
  return {
    week: {
      preciseMs: weekPreciseMs,
      preciseText: formatPreciseHMS(weekPreciseMs),
      roundedMin: weekRoundedMin,
      roundedHoursText: formatQuarterHours(weekRoundedMin / 15),
    },
    month: {
      preciseMs: monthPreciseMs,
      preciseText: formatPreciseHMS(monthPreciseMs),
      roundedMin: monthRoundedMin,
      roundedHoursText: formatQuarterHours(monthRoundedMin / 15),
    },
  };
}

// ===== メイン =====
document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(location.search);
  const action = params.get("action");
  const timestamp = params.get("timestamp");
  const source = params.get("source");
  const page = params.get("page");
  const ref = params.get("ref");
  const team = params.get("team");
  const project = params.get("project");

  const statusEl = document.getElementById("status");
  const tableBody = document.getElementById("tbody");
  const latestEl = document.getElementById("latest");
  const totalsHost = document.getElementById("totals");
  const apiStatusEl = document.getElementById("apiStatus");

  // 保存された勤怠ログを読み込み
  let logs = loadLogs();
  let justRecorded = false,
    duplicate = false;

  // 新しい勤怠イベントの処理
  if (action && timestamp) {
    // 重複チェック - 同じactionとtimestampの組み合わせが既に存在するか
    const exists = logs.some(
      (l) => l.action === action && l.timestamp === timestamp
    );
    if (!exists) {
      // 新規レコードの場合
      // 新しいレコードを作成して保存
      const rec = {
        id: Date.now(),
        action,
        timestamp,
        source,
        team,
        project,
        page,
        ref,
      };
      logs.push(rec);
      saveLogs(logs);
      justRecorded = true; // ローカル保存
      // API連携を試行
      const apiRes = await postAPI(rec);
      // API送信結果をUIに表示
      if (apiStatusEl) {
        if (apiRes.skipped) {
          apiStatusEl.textContent = "API連携: 未設定（ローカル保存のみ）";
          apiStatusEl.className = "muted small";
        } else if (apiRes.ok) {
          apiStatusEl.textContent = `API連携: 成功 (${apiRes.status})`;
          apiStatusEl.className = "small";
        } else {
          apiStatusEl.textContent = `API連携: 失敗${
            apiRes.status ? ` (${apiRes.status})` : ""
          }${apiRes.error ? ` - ${apiRes.error}` : ""}`;
          apiStatusEl.className = "small";
        }
      }
    } else {
      // 重複イベントの場合
      duplicate = true;
    }
  }

  // 現在のイベントのステータス表示を更新
  if (action && timestamp) {
    const ok = logs.some(
      (l) => l.action === action && l.timestamp === timestamp
    );
    const label =
      action === "clock_in"
        ? "出勤"
        : action === "clock_out"
        ? "退勤"
        : action === "project_switch"
        ? "切替"
        : action;
    statusEl.innerHTML = ok
      ? `<span class="stat"><span class="dot okdot"></span>記録済み: <b>${label}</b> / <b>${fmtJP(
          timestamp
        )}</b><span class="utc" style="margin-left:8px">${fmtUTCshort(
          timestamp
        )}</span></span>`
      : `<span class="stat"><span class="dot errdot"></span>未記録</span>`;
    if (duplicate)
      statusEl.insertAdjacentHTML(
        "beforeend",
        ` <span class="badge warn">重複イベント（保存はスキップ）</span>`
      );
    else if (justRecorded)
      statusEl.insertAdjacentHTML(
        "beforeend",
        ` <span class="badge in">新規保存</span>`
      );
  } else {
    statusEl.innerHTML = `<span class="stat"><span class="dot warndot"></span>待機中：URLに <code>action</code> と <code>timestamp</code> がありません</span>`;
  }

  // 最新の勤怠記録を表示
  const latest = logs[logs.length - 1];
  const lab = latest
    ? latest.action === "clock_in"
      ? "出勤"
      : latest.action === "clock_out"
      ? "退勤"
      : latest.action === "project_switch"
      ? "切替"
      : latest.action
    : "";
  latestEl.innerHTML = latest
    ? `<div class="row" style="gap:12px;flex-wrap:wrap">
         <span class="badge ${
           latest.action === "clock_in"
             ? "in"
             : latest.action === "project_switch"
             ? "warn"
             : "out"
         }">${lab}</span>
         <span class="dt">${fmtJP(latest.timestamp)}</span>
         <span class="utc">${fmtUTCshort(latest.timestamp)}</span>
         ${
           latest.source
             ? `<span class="muted small">from: ${latest.source}</span>`
             : ""
         }
       </div>`
    : `<span class="muted">まだ記録がありません</span>`;

  // ===== 集計 & テーブル描画 =====
  async function render() {
    tableBody.innerHTML = "";
    const { pairs, byOutId } = await buildPairs(logs);

    // 週・月合計（右カード）
    const totals = computeTotals(pairs);
    totalsHost.innerHTML = `<div class="row" style="gap:12px;flex-wrap:wrap">
         <span class="badge in">今週 合計</span>
         <span class="small">正確: <b>${
           totals.week.preciseText
         }</b>（${Math.floor(totals.week.preciseMs / 60000)}分）</span>
         <span class="small">/ 0.25h: <b>${
           totals.week.roundedHoursText
         }時間</b>（${totals.week.roundedMin}分）</span>
       </div>
       <div class="row" style="gap:12px;flex-wrap:wrap;margin-top:6px">
         <span class="badge out">今月 合計</span>
         <span class="small">正確: <b>${
           totals.month.preciseText
         }</b>（${Math.floor(totals.month.preciseMs / 60000)}分）</span>
         <span class="small">/ 0.25h: <b>${
           totals.month.roundedHoursText
         }時間</b>（${totals.month.roundedMin}分）</span>
       </div>`;

    // ログ（新しい順）
    const rows = [...logs].reverse();
    rows.forEach((r, idx) => {
      const lab2 =
        r.action === "clock_in"
          ? "出勤"
          : r.action === "clock_out"
          ? "退勤"
          : r.action === "project_switch"
          ? "切替"
          : r.action;
      let preciseCell = "",
        quarterCell = "";
      if (r.action === "clock_out" && byOutId.has(r.id)) {
        const p = byOutId.get(r.id);
        const precise = formatPreciseHMS(
          p.actualMs || p.diffMs,
          p.breakOverlapMs > 0,
          p.breakOverlapMs
        );
        preciseCell = `${precise}（${p.totalMin}分）`;
        quarterCell = `${p.quarterHoursStr}時間（${p.quarterMin}分）`;
      }
      const esc = (s) =>
        String(s ?? "").replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            }[c])
        );
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="small">${rows.length - idx}</td>
        <td><span class="badge ${
          r.action === "clock_in"
            ? "in"
            : r.action === "project_switch"
            ? "warn"
            : "out"
        }">${lab2}</span></td>
        <td>${cellDateHTML(r.timestamp)}</td>
        <td class="small">${r.source || ""}</td>
        <td class="small">${r.team || ""}</td>
        <td class="small">${r.project || ""}</td>
        <td class="small">${r.page ? esc(r.page).replace(/\+/g, " ") : ""}</td>
        <td class="small">${
          r.ref
            ? `<a href="${esc(
                r.ref
              )}" target="_blank" rel="noreferrer">リンク</a>`
            : ""
        }</td>
        <td class="small">${preciseCell}</td>
        <td class="small">${quarterCell}</td>`;
      tableBody.appendChild(tr);
    });
  }
  await render();

  // CSVエクスポートボタンのイベントリスナー
  document
    .getElementById("btnExport")
    .addEventListener("click", () => exportCSV(logs));
  // ログ消去ボタンのイベントリスナー
  document.getElementById("btnClear").addEventListener("click", async () => {
    if (confirm("ローカルの勤怠ログを全消去します。よろしいですか？")) {
      logs = [];
      saveLogs(logs);
      await render();
      latestEl.innerHTML = '<span class="muted">まだ記録がありません</span>';
      statusEl.innerHTML = `<span class="stat"><span class="dot warndot"></span>ログを消去しました</span>`;
    }
  });
});
