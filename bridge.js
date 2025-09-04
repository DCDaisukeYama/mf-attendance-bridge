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
// 勤怠ログをCSVファイルとしてエクスポート
function exportCSV(rows, filename = "attendance_logs.csv") {
  const header = [
    "id",
    "action",
    "timestamp",
    "timestamp_jst",
    "source",
    "page",
    "ref",
  ];
  const lines = [header.join(",")].concat(
    rows.map((r) =>
      [
        r.id,
        r.action,
        r.timestamp,
        fmtJP(r.timestamp),
        r.source || "",
        r.page || "",
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

// ---- 労働時間ペア計算 ----
function buildPairs(logs) {
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
          const totalMin = Math.floor(ms / 60000);
          const quarterUnits = Math.round(ms / (15 * 60 * 1000));
          const quarterMin = quarterUnits * 15;
          const quarterHoursStr = formatQuarterHours(quarterUnits);
          pairs.push({
            inLog,
            outLog: l,
            diffMs: ms,
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
function formatPreciseHMS(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h}時間`);
  if (m) parts.push(`${m}分`);
  if (sec || parts.length === 0) parts.push(`${sec}秒`);
  return parts.join("");
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
      weekPreciseMs += p.diffMs;
      weekRoundedMin += p.quarterMin;
    }
    if (outJst >= monthStart && outJst < monthEnd) {
      monthPreciseMs += p.diffMs;
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
      const rec = { id: Date.now(), action, timestamp, source, page, ref };
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
      action === "clock_in" ? "出勤" : action === "clock_out" ? "退勤" : action;
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
      : latest.action
    : "";
  latestEl.innerHTML = latest
    ? `<div class="row" style="gap:12px;flex-wrap:wrap">
         <span class="badge ${
           latest.action === "clock_in" ? "in" : "out"
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
  function render() {
    tableBody.innerHTML = "";
    const { pairs, byOutId } = buildPairs(logs);

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
          : r.action;
      let preciseCell = "",
        quarterCell = "";
      if (r.action === "clock_out" && byOutId.has(r.id)) {
        const p = byOutId.get(r.id);
        const precise = formatPreciseHMS(p.diffMs);
        preciseCell = `${precise}（${p.totalMin}分）`;
        quarterCell = `${p.quarterHoursStr}時間（${p.quarterMin}分）`;
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="small">${rows.length - idx}</td>
        <td><span class="badge ${
          r.action === "clock_in" ? "in" : "out"
        }">${lab2}</span></td>
        <td>${cellDateHTML(r.timestamp)}</td>
        <td class="small">${r.source || ""}</td>
        <td class="small">${r.page ? r.page.replace(/\+/g, " ") : ""}</td>
        <td class="small">${
          r.ref
            ? `<a href="${r.ref}" target="_blank" rel="noreferrer">リンク</a>`
            : ""
        }</td>
        <td class="small">${preciseCell}</td>
        <td class="small">${quarterCell}</td>`;
      tableBody.appendChild(tr);
    });
  }
  render();

  // CSVエクスポートボタンのイベントリスナー
  document
    .getElementById("btnExport")
    .addEventListener("click", () => exportCSV(logs));
  // ログ消去ボタンのイベントリスナー
  document.getElementById("btnClear").addEventListener("click", () => {
    if (confirm("ローカルの勤怠ログを全消去します。よろしいですか？")) {
      logs = [];
      saveLogs(logs);
      tableBody.innerHTML = "";
      latestEl.innerHTML = '<span class="muted">まだ記録がありません</span>';
      totalsHost.textContent = "";
      statusEl.innerHTML = `<span class="stat"><span class="dot warndot"></span>ログを消去しました</span>`;
    }
  });
});
