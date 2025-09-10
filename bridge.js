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
    
    // 日本時間での各部分を取得（数値として）
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: tzJP,
      year: "numeric",
      month: "2-digit", 
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(d);
    
    // 各部分を抽出
    const year = parts.find(part => part.type === 'year').value;
    const month = parts.find(part => part.type === 'month').value;
    const day = parts.find(part => part.type === 'day').value;
    const hour = parts.find(part => part.type === 'hour').value;
    const minute = parts.find(part => part.type === 'minute').value;
    const second = parts.find(part => part.type === 'second').value;
    
    // 月と日から先頭の0を削除
    const m = parseInt(month, 10);
    const da = parseInt(day, 10);
    
    return `${year}年${m}月${da}日 ${hour}時${minute}分${second}秒`;
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

// プロジェクト切替を考慮した作業セグメントを構築
async function buildWorkSegments(logs) {
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
  
  const segments = [];
  let currentStart = null;
  let currentProject = null;
  let currentTeam = null;

  for (let i = 0; i < sorted.length; i++) {
    const log = sorted[i];
    
    if (log.action === "clock_in") {
      currentStart = log;
      currentProject = log.project;
      currentTeam = log.team;
    } else if (log.action === "project_switch" && currentStart) {
      // 前のプロジェクトのセグメントを終了
      if (currentProject && currentStart) {
        const ms = new Date(log.timestamp) - new Date(currentStart.timestamp);
        if (ms > 0) {
          const breakOverlapMs = calculateBreakOverlap(
            currentStart.timestamp,
            log.timestamp,
            breakStart,
            breakEnd
          );
          const actualMs = ms - breakOverlapMs;

          segments.push({
            startLog: currentStart,
            endLog: log,
            project: currentProject,
            team: currentTeam,
            diffMs: ms,
            actualMs: actualMs,
            breakOverlapMs: breakOverlapMs,
            type: 'project_segment'
          });
        }
      }
      
      // 新しいプロジェクトの開始
      currentStart = { ...log, action: "clock_in" }; // project_switchを疑似clock_inとして扱う
      currentProject = log.project;
      currentTeam = log.team;
    } else if (log.action === "clock_out" && currentStart) {
      // 最後のセグメントを終了
      if (currentProject && currentStart) {
        const ms = new Date(log.timestamp) - new Date(currentStart.timestamp);
        if (ms > 0) {
          const breakOverlapMs = calculateBreakOverlap(
            currentStart.timestamp,
            log.timestamp,
            breakStart,
            breakEnd
          );
          const actualMs = ms - breakOverlapMs;

          segments.push({
            startLog: currentStart,
            endLog: log,
            project: currentProject,
            team: currentTeam,
            diffMs: ms,
            actualMs: actualMs,
            breakOverlapMs: breakOverlapMs,
            type: 'final_segment'
          });
        }
      }
      
      currentStart = null;
      currentProject = null;
      currentTeam = null;
    }
  }

  return segments;
}

// 同じ日の同じプロジェクトのセグメントを累積する
function consolidateSegmentsByProject(segments) {
  const consolidated = {};
  
  for (const segment of segments) {
    // 日付を取得（JST）
    const endDate = new Date(segment.endLog.timestamp);
    const dateKey = endDate.toLocaleDateString('ja-JP', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    }).replace(/\//g, '-'); // YYYY-MM-DD形式
    
    const key = `${dateKey}_${segment.project}`;
    
    if (!consolidated[key]) {
      consolidated[key] = {
        ...segment,
        segments: [segment], // 元のセグメントを保持
        totalActualMs: segment.actualMs,
        totalDiffMs: segment.diffMs,
        totalBreakOverlapMs: segment.breakOverlapMs
      };
      console.log(`新規作成: ${key}, actualMs: ${segment.actualMs}ms`);
    } else {
      // 累積処理
      const prevTotal = consolidated[key].totalActualMs;
      consolidated[key].segments.push(segment);
      consolidated[key].totalActualMs += segment.actualMs;
      consolidated[key].totalDiffMs += segment.diffMs;
      consolidated[key].totalBreakOverlapMs += segment.breakOverlapMs;
      
      console.log(`累積: ${key}, 前回: ${prevTotal}ms + 今回: ${segment.actualMs}ms = 合計: ${consolidated[key].totalActualMs}ms`);
      
      // 最初のstartLogを保持（最早の開始時刻）
      if (new Date(segment.startLog.timestamp) < new Date(consolidated[key].startLog.timestamp)) {
        consolidated[key].startLog = segment.startLog;
      }
      
      // 最後のendLogを更新（最新の終了時刻を保持）
      if (new Date(segment.endLog.timestamp) > new Date(consolidated[key].endLog.timestamp)) {
        consolidated[key].endLog = segment.endLog;
      }
    }
  }
  
  return Object.values(consolidated);
}

// 休憩時間を考慮したスプレッドシート再書き込み機能
async function rewriteSheetWithBreakTime(logs) {
  const rewriteStatusEl = document.getElementById("rewriteStatus");
  
  try {
    rewriteStatusEl.textContent = "休憩時間を考慮した再書き込み処理を開始しています...";
    
    // プロジェクト切替を考慮した作業セグメントを作成
    const rawSegments = await buildWorkSegments(logs);
    
    if (rawSegments.length === 0) {
      rewriteStatusEl.textContent = "再書き込み対象のデータがありません";
      setTimeout(() => rewriteStatusEl.textContent = "", 3000);
      return;
    }

    // 同じ日の同じプロジェクトのセグメントを累積
    const segments = consolidateSegmentsByProject(rawSegments);
    
    console.log(`累積処理: ${rawSegments.length}個のセグメントから${segments.length}個の累積セグメントを作成`, segments);

    let successCount = 0;
    let errorCount = 0;
    
    if (rawSegments.length !== segments.length) {
      rewriteStatusEl.textContent = `${rawSegments.length}個のセグメントを${segments.length}個に累積して処理中...`;
    } else {
      rewriteStatusEl.textContent = `${segments.length}件のセグメントを処理中...`;
    }
    
    // セグメント再書き込みのリトライ機能付き関数
    const rewriteSegmentWithRetry = async (segment, maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // バックグラウンドスクリプトにメッセージを送信して再書き込み（タイムアウト付き）
          const response = await Promise.race([
            new Promise((resolve, reject) => {
              const message = {
                type: "REWRITE_SHEET_WITH_BREAK",
                payload: {
                  inTime: segment.startLog.timestamp,
                  outTime: segment.endLog.timestamp,
                  team: segment.team,
                  project: segment.project,
                  actualMs: segment.totalActualMs // 累積された休憩時間を考慮した実際の勤務時間
                }
              };
              
              console.log("Sending message to background:", message);
              
              chrome.runtime.sendMessage(message, (response) => {
                console.log("Received response from background:", response);
                
                if (chrome.runtime.lastError) {
                  console.error("Chrome runtime error:", chrome.runtime.lastError);
                  reject(new Error(chrome.runtime.lastError.message));
                } else if (response === undefined) {
                  console.error("Received undefined response");
                  reject(new Error('Received undefined response from background script'));
                } else {
                  resolve(response);
                }
              });
            }),
            // 20秒でタイムアウト（短縮）
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Request timeout after 20 seconds')), 20000)
            )
          ]);
          
          return response; // 成功した場合はレスポンスを返す
        } catch (error) {
          console.warn(`セグメント再書き込み試行 ${attempt}/${maxRetries} 失敗:`, error.message, segment.project);
          
          if (attempt === maxRetries) {
            throw error; // 最後の試行でも失敗した場合はエラーを投げる
          }
          
          // 次の試行前に少し待機（指数バックオフ）
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    };

    // 各セグメントについてスプレッドシートに再書き込み
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      try {
        const response = await rewriteSegmentWithRetry(segment);
        
        if (response?.ok) {
          successCount++;
          console.log(`セグメント ${i + 1}/${segments.length} 成功:`, segment.project);
        } else {
          errorCount++;
          console.warn(`再書き込み失敗 (${i + 1}/${segments.length}):`, response, segment);
        }
        
      } catch (error) {
        errorCount++;
        console.error(`再書き込み処理最終エラー (${i + 1}/${segments.length}):`, error.message, segment);
      }
      
      // 進捗表示を更新
      rewriteStatusEl.textContent = `処理中... (${i + 1}/${segments.length}) 成功: ${successCount}, 失敗: ${errorCount}`;
      
      // 短い間隔を空けてAPI制限を回避
      if (i < segments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // 結果表示
    const accumulationText = rawSegments.length !== segments.length ? 
      ` (${rawSegments.length}個のセグメントから累積)` : '';
    
    if (errorCount === 0) {
      rewriteStatusEl.textContent = `✓ 再書き込み完了: ${successCount}件のプロジェクトデータを処理${accumulationText}`;
      rewriteStatusEl.className = "small";
      rewriteStatusEl.style.color = "var(--ok)";
    } else {
      rewriteStatusEl.textContent = `⚠ 再書き込み完了: 成功 ${successCount}件, 失敗 ${errorCount}件${accumulationText}`;
      rewriteStatusEl.className = "small";
      rewriteStatusEl.style.color = "var(--warn)";
    }
    
    // 3秒後にステータスをクリア
    setTimeout(() => {
      rewriteStatusEl.textContent = "";
      rewriteStatusEl.style.color = "";
      rewriteStatusEl.className = "small muted";
    }, 5000);
    
  } catch (error) {
    console.error("再書き込み処理でエラーが発生しました:", error);
    rewriteStatusEl.textContent = "❌ 再書き込み処理でエラーが発生しました";
    rewriteStatusEl.className = "small";
    rewriteStatusEl.style.color = "var(--err)";
    setTimeout(() => {
      rewriteStatusEl.textContent = "";
      rewriteStatusEl.style.color = "";
      rewriteStatusEl.className = "small muted";
    }, 5000);
  }
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

  // ISOタイムスタンプをJSTのDateオブジェクトに変換
  const inDate = new Date(inTime);
  const outDate = new Date(outTime);

  // JSTでの日付を取得（Intl.DateTimeFormatを使用して正確な日付を取得）
  const inJstDateStr = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(inDate);
  
  const outJstDateStr = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", 
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(outDate);

  // 同一日の場合のみ休憩時間を考慮
  if (inJstDateStr !== outJstDateStr) return 0;

  // 時刻文字列をパース（HH:MM形式）
  const [breakStartHour, breakStartMin] = breakStart.split(":").map(Number);
  const [breakEndHour, breakEndMin] = breakEnd.split(":").map(Number);

  // JSTでの出勤・退勤時刻を取得
  const inJstTimeStr = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(inDate);
  
  const outJstTimeStr = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit", 
    minute: "2-digit",
    hour12: false
  }).format(outDate);

  const [inHour, inMin] = inJstTimeStr.split(":").map(Number);
  const [outHour, outMin] = outJstTimeStr.split(":").map(Number);

  // 分単位で計算（より正確な比較のため）
  const inMinutes = inHour * 60 + inMin;
  const outMinutes = outHour * 60 + outMin;
  const breakStartMinutes = breakStartHour * 60 + breakStartMin;
  const breakEndMinutes = breakEndHour * 60 + breakEndMin;

  // 重複する時間を分単位で計算
  const overlapStartMinutes = Math.max(inMinutes, breakStartMinutes);
  const overlapEndMinutes = Math.min(outMinutes, breakEndMinutes);

  // 重複がある場合はその時間をミリ秒で返す
  if (overlapEndMinutes > overlapStartMinutes) {
    return (overlapEndMinutes - overlapStartMinutes) * 60 * 1000;
  }
  
  return 0;
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

  // 休憩時間考慮でシート再書き込みボタンのイベントリスナー
  document.getElementById("btnRewriteSheet").addEventListener("click", async () => {
    await rewriteSheetWithBreakTime(logs);
  });

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
