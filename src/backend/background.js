// ===== background.js v1.0.2 =====
// Brave/Vivaldi/Opera/Chrome => chrome-extension://
// Microsoft Edge => extension://
console.log("[MF-Bridge] Background script loaded v1.0.3 - Fixed notification icon paths using chrome.runtime.getURL()");

// StorageUtils実装
const StorageUtils = {
  async get(keys) {
    return await chrome.storage.sync.get(keys);
  },
  
  async set(data) {
    return await chrome.storage.sync.set(data);
  },
  
  async remove(keys) {
    return await chrome.storage.sync.remove(keys);
  },
  
  async clear() {
    return await chrome.storage.sync.clear();
  }
};

function detectBrowserBrand() {
  const ua = (navigator && navigator.userAgent) || "";
  if (/Edg\//.test(ua)) return "edge";
  if (/Vivaldi/i.test(ua)) return "vivaldi";
  if (/OPR\//.test(ua)) return "opera";
  if (/Brave/i.test(ua)) return "brave";
  if (/Chrome\//.test(ua)) return "chrome";
  return "chromium";
}
function defaultSchemeForBrand(brand) {
  return brand === "edge" ? "extension" : "chrome-extension";
}
async function readForcedScheme() {
  // extUrlScheme があればそれを優先（オプション画面がなくても devtools 等で設定可能）
  try {
    const r = await StorageUtils.get(["extUrlScheme"]);
    const s = r && r.extUrlScheme;
    return s === "extension" || s === "chrome-extension" ? s : null;
  } catch {
    return null;
  }
}
function buildExtensionUrl(path, schemeOverride) {
  const id = chrome.runtime.id;
  const brand = detectBrowserBrand();
  const scheme = schemeOverride || defaultSchemeForBrand(brand);
  return `${scheme}://${id}/${String(path).replace(/^\//, "")}`;
}

function normalizeExtensionScheme(urlStr, schemeOverride) {
  try {
    const u = new URL(urlStr);
    const isExt =
      u.protocol === "chrome-extension:" || u.protocol === "extension:";
    if (!isExt) return urlStr;

    const brand = detectBrowserBrand();
    const should = (schemeOverride || defaultSchemeForBrand(brand)) + ":";
    if (u.protocol !== should) {
      u.protocol = should;
      return u.toString();
    }
    return urlStr;
  } catch {
    return urlStr;
  }
}

// ===== Settings =====
const STATIC_KEYS = [
  "targetPageUrl",
  "enableDirectPost",
  "targetApiUrl",
  "apiKey",
  "openInBackground",
  "autoCloseMs",
  "showNotificationOnSuccess",
  "inKeywords",
  "outKeywords",
  "inSelectors",
  "outSelectors",
  "debounceMs",
  "debug",
  "extUrlScheme",
  // ---- Spreadsheet mode ----
  "sheetMode", // true/false
  "sheetWebAppUrl", // GAS Web アプリ URL（/exec）
  "spreadsheetId", // シートID（URLから抽出でも可）
  "spreadsheetUrl", // 入力URL（ID抽出用の後方互換）
  "sheetHeaders", // B1..R1 の見出し配列（抽出済みを保存）
  "sheetHeaderStartCol", // 既定 "B"
  "sheetNameFormat", // 既定 "YYYY年M月"
  "ssHeaderCache", // { "YYYY年M月": ["PJ1","PJ2",...] }
  "ssTeam", // チーム名
];

async function getDynamicDefaults() {
  const forced = await readForcedScheme();
  const bridgeUrl = buildExtensionUrl("bridge.html", forced);
  return {
    targetPageUrl: bridgeUrl,
    enableDirectPost: false,
    targetApiUrl: "",
    apiKey: "",
    openInBackground: false,
    autoCloseMs: 3000,
    showNotificationOnSuccess: true,
    inKeywords: [
      "出勤",
      "出社",
      "打刻開始",
      "勤務開始",
      "check in",
      "clock in",
    ],
    outKeywords: [
      "退勤",
      "退社",
      "打刻終了",
      "勤務終了",
      "check out",
      "clock out",
    ],
    inSelectors: [".clock_in .time-stamp-button"],
    outSelectors: [".clock_out .time-stamp-button"],
    debounceMs: 1200,
    debug: true,
    extUrlScheme: forced || null,
    // Spreadsheet mode defaults
    sheetMode: false,
    sheetWebAppUrl: "",
    spreadsheetId: "",
    spreadsheetUrl: "",
    sheetHeaders: [], // ex: ["PJ-A","PJ-B",...]
    sheetHeaderStartCol: "B",
    sheetNameFormat: "YYYY年M月",
    ssHeaderCache: {},
    ssTeam: "所属チーム",
  };
}

// 現在の設定を保持するグローバル変数
let settings = null;

// ストレージから設定を読み込み、メモリに保存
async function loadSettings() {
  const dynamic = await getDynamicDefaults();
  const saved = await StorageUtils.get(STATIC_KEYS);
  const forced = saved.extUrlScheme || dynamic.extUrlScheme || null;
  const merged = { ...dynamic, ...saved };

  // spreadsheetId が空なら URL から抽出試行
  if (!merged.spreadsheetId && merged.spreadsheetUrl) {
    const m = String(merged.spreadsheetUrl).match(
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
    );
    if (m) merged.spreadsheetId = m[1];
  }

  // sheetHeaders が空で ssHeaderCache がある場合は復元
  if (!merged.sheetHeaders?.length && merged.ssHeaderCache) {
    const currentMonth = monthSheetNameByFormat(
      merged.sheetNameFormat || "YYYY年M月",
      new Date().toISOString()
    );
    merged.sheetHeaders = merged.ssHeaderCache[currentMonth] || [];
  }

  merged.targetPageUrl = normalizeExtensionScheme(merged.targetPageUrl, forced);
  settings = merged;

  // デバッグ用：設定を出力
  log("Settings loaded:", {
    sheetMode: settings.sheetMode,
    sheetWebAppUrl: settings.sheetWebAppUrl,
    sheetToken: settings.sheetToken ? "***set***" : "***not set***",
    spreadsheetId: settings.spreadsheetId,
    spreadsheetUrl: settings.spreadsheetUrl,
    sheetHeaders: settings.sheetHeaders,
    ssHeaderCache: Object.keys(settings.ssHeaderCache || {}),
  });
}

async function seedDefaultsIfMissing() {
  const dynamic = await getDynamicDefaults();
  const saved = await StorageUtils.get(STATIC_KEYS);
  const toSet = {};
  for (const k of STATIC_KEYS) {
    if (saved[k] === undefined) toSet[k] = dynamic[k];
  }
  if (Object.keys(toSet).length) await StorageUtils.set(toSet);
}

// デバッグ用のログ出力関数（debug設定がtrueの時のみ表示）
function log(...args) {
  if (settings?.debug) console.log("[MF-Bridge]", ...args);
}

// 拡張機能インストール・更新時の初期化処理
chrome.runtime.onInstalled.addListener(async () => {
  await seedDefaultsIfMissing();
  await loadSettings();
});

// Chrome起動時に設定を再読み込み
chrome.runtime.onStartup.addListener(loadSettings);
// 設定変更時のリアルタイム反映
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") loadSettings();
});

// 直接API POSTモード - 設定されたAPIエンドポイントに勤怠データを送信
async function postDirect(payload) {
  log("postDirect called with:", payload);
  log("API URL:", settings.targetApiUrl);
  log("API Key present:", !!settings.apiKey);
  
  const headers = { "Content-Type": "application/json" };
  if (settings.apiKey) headers["Authorization"] = `Bearer ${settings.apiKey}`;
  
  try {
    const res = await fetch(settings.targetApiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    });
    
    log("postDirect response:", { status: res.status, ok: res.ok, statusText: res.statusText });
    
    if (!res.ok) {
      log("postDirect failed with status:", res.status, res.statusText);
      // レスポンスボディも記録（デバッグ用）
      try {
        const errorBody = await res.text();
        log("postDirect error body:", errorBody);
      } catch (bodyError) {
        log("Could not read error body:", bodyError.message);
      }
    }
    
    return res.ok;
  } catch (error) {
    log("postDirect fetch error:", error.message);
    return false;
  }
}

// ブリッジページモード - bridge.htmlをタブで開いて勤怠データを渡す
async function openBridgeTab(payload) {
  const forced = settings.extUrlScheme || null;
  const baseUrl = normalizeExtensionScheme(settings.targetPageUrl, forced);
  const u = new URL(baseUrl);
  u.searchParams.set("source", "moneyforward");
  u.searchParams.set("action", payload.action);
  u.searchParams.set("timestamp", payload.timestamp);
  u.searchParams.set("page", payload.pageTitle || "");
  u.searchParams.set("ref", payload.pageUrl || "");
  if (payload.team) u.searchParams.set("team", payload.team);
  if (payload.project) u.searchParams.set("project", payload.project);

  const tab = await chrome.tabs.create({
    url: u.toString(),
    active: !settings.openInBackground,
  });

  if (settings.autoCloseMs > 0 && settings.openInBackground) {
    setTimeout(() => {
      chrome.tabs.remove(tab.id).catch(() => {});
    }, settings.autoCloseMs);
  }
}

// ===== Helpers for Spreadsheet mode =====
const JST_OFFSET = 9 * 3600 * 1000;

function jstParts(iso) {
  const t = new Date(iso).getTime() + JST_OFFSET;
  const d = new Date(t);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1, // 1-12
    day: d.getUTCDate(), // 1-31
  };
}

function monthSheetNameByFormat(fmt, iso) {
  const { year, month } = jstParts(iso);
  if (fmt === "YYYY年M月") return `${year}年${month}月`;
  // 追加パターンを増やしたければここに
  return `${year}年${month}月`;
}

function rowIndexForDay(day) {
  return 1 + day; /* A2=1日 → 行=day+1 */
}

function a1ColFromNumber(n) {
  // 1->A, 2->B
  let s = "";
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function colNumberFromLetter(letter) {
  // "A"->1, "B"->2
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function quarterHoursDecimal(ms) {
  const q = Math.round(ms / (15 * 60 * 1000)); // 15分単位
  return q / 4; // 0.25刻みの小数（2.25 など）
}

// 現在選択中のチーム/プロジェクト名を取得（popup の保存情報から）
async function getActiveTeamProjectNames() {
  const { teams, activeTeamId, activeProjectId } =
    await StorageUtils.get(["teams", "activeTeamId", "activeProjectId"]);
  const team =
    (teams || []).find((t) => t.id === activeTeamId) || (teams || [])[0];
  const project =
    team?.projects?.find((p) => p.id === activeProjectId) ||
    team?.projects?.[0];
  return { teamName: team?.name || "", projectName: project?.name || "" };
}

// B1:R1 を CSV でライブ取得（拡張の host_permissions は manifest に既に追加済み）
async function fetchHeadersBR1(spreadsheetId, sheetName, startCol) {
  const range = `${startCol || "B"}1:R1`;
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    sheetName
  )}&range=${range}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`header fetch HTTP ${res.status}`);
  const text = (await res.text()).trim();
  return text
    .split(",")
    .map((s) => s.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}

// 1) settings.sheetHeaders → 2) ssHeaderCache[当月] → 3) ライブ取得（成功したら保存）
async function getHeadersForMonth(sheetName, spreadsheetId) {
  let headers =
    (settings.sheetHeaders && settings.sheetHeaders.length
      ? settings.sheetHeaders
      : []) || [];
  if (
    !headers.length &&
    settings.ssHeaderCache &&
    settings.ssHeaderCache[sheetName]
  ) {
    headers = settings.ssHeaderCache[sheetName] || [];
  }
  if (!headers.length && spreadsheetId) {
    try {
      headers = await fetchHeadersBR1(
        spreadsheetId,
        sheetName,
        settings.sheetHeaderStartCol || "B"
      );
      const cache = { ...(settings.ssHeaderCache || {}) };
      cache[sheetName] = headers;
      await chrome.storage.sync.set({
        ssHeaderCache: cache,
        sheetHeaders: headers,
      });
      settings.ssHeaderCache = cache;
      settings.sheetHeaders = headers;
    } catch (e) {
      log("header live fetch failed:", e);
    }
  }
  return headers;
}

// WebアプリURLからトークンを抽出
function extractTokenFromWebAppUrl(webAppUrl) {
  if (!webAppUrl) return "";
  const match = String(webAppUrl).match(/\/macros\/s\/([^\/]+)/);
  return match ? match[1] : "";
}

// B1..R1 の配列と開始列から、ヘッダ名→列記号を求める
function resolveColumnLetter(headers, headerStartCol, headerName) {
  const start = colNumberFromLetter(headerStartCol || "B"); // 既定B=2
  const idx = (headers || []).indexOf(headerName);
  if (idx < 0) return null;
  return a1ColFromNumber(start + idx);
}

// スプレッドシートから指定セルの現在値を取得（CSV経由）
async function getCurrentCellValue(spreadsheetId, sheetName, col, row) {
  try {
    const range = `${col}${row}:${col}${row}`;
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&range=${range}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    
    const text = (await res.text()).trim();
    if (!text) return 0;
    
    // CSVのセル値をパース（数値として解釈）
    const value = text.replace(/^"|"$/g, '').trim();
    const numValue = parseFloat(value);
    return isNaN(numValue) ? 0 : numValue;
  } catch (error) {
    log(`Failed to get current value for ${col}${row}:`, error);
    return 0; // エラー時は0を返す
  }
}

async function postToGAS({ endIso, projectName, valueDecimal }) {
  log("postToGAS called with:", { endIso, projectName, valueDecimal });

  if (!settings.sheetMode) {
    log("Sheet mode is disabled");
    return { ok: false, reason: "sheetMode off" };
  }

  if (
    !settings.sheetWebAppUrl ||
    (!settings.spreadsheetId && !settings.spreadsheetUrl)
  ) {
    log("Missing webAppUrl or spreadsheetId:", {
      webAppUrl: settings.sheetWebAppUrl,
      spreadsheetId: settings.spreadsheetId,
      spreadsheetUrl: settings.spreadsheetUrl,
    });
    return { ok: false, reason: "missing webAppUrl or spreadsheetId" };
  }

  // シート名・行
  const sheetName = monthSheetNameByFormat(settings.sheetNameFormat, endIso);
  const { day } = jstParts(endIso);
  const row = rowIndexForDay(day);

  log("Sheet details:", { sheetName, day, row });

  // SpreadSheet ID（URL→ID抽出の後方互換）
  let spreadsheetId = settings.spreadsheetId;
  if (!spreadsheetId && settings.spreadsheetUrl) {
    const m = String(settings.spreadsheetUrl).match(
      /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
    );
    spreadsheetId = m ? m[1] : "";
  }
  if (!spreadsheetId) {
    log("spreadsheetId empty");
    return { ok: false, reason: "spreadsheetId empty" };
  }

  // ---- ヘッダーを必ず用意する（sheetHeaders → ssHeaderCache → ライブ取得）----
  const headers = await getHeadersForMonth(sheetName, spreadsheetId);
  log("Resolved headers:", headers);

  const letter = resolveColumnLetter(
    headers,
    settings.sheetHeaderStartCol || "B",
    projectName
  );
  if (!letter) {
    log(`Header not found for project: ${projectName}`);
    return { ok: false, reason: `header not found for project=${projectName}` };
  }

  // 既存の値を取得して累積計算
  const currentValue = await getCurrentCellValue(spreadsheetId, sheetName, letter, row);
  const newValue = currentValue + valueDecimal;
  
  log(`Accumulating values: current=${currentValue} + new=${valueDecimal} = total=${newValue}`);

  // WebアプリURLからトークンを抽出
  const token = extractTokenFromWebAppUrl(settings.sheetWebAppUrl);

  const body = {
    token: token,
    spreadsheetId,
    sheetName,
    row,
    values: [{ col: letter, value: newValue }], // 累積後の値を送信
  };

  log("Sending to GAS:", body);

  try {
    const res = await fetch(settings.sheetWebAppUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });

    log("GAS response status:", res.status);

    const responseText = await res.text();
    log("GAS response text:", responseText);

    const json = responseText ? JSON.parse(responseText) : {};
    const result = { ok: !!json.ok, status: res.status, json };

    log("Final result:", result);
    return result;
  } catch (e) {
    log("GAS request error:", e);
    return { ok: false, error: String(e) };
  }
}

// セグメント(出勤中の区間)の保存場所は local に
const SEG_KEY = "activeSegment";

async function getSeg() {
  try {
    const r = await chrome.storage.local.get([SEG_KEY]);
    return r[SEG_KEY] || null;
  } catch {
    return null;
  }
}

async function setSeg(seg) {
  await chrome.storage.local.set({ [SEG_KEY]: seg });
}

async function clearSeg() {
  await chrome.storage.local.remove([SEG_KEY]);
}

// 休憩時間を考慮した実労働時間を計算
async function calculateActualWorkingTime(startIso, endIso, originalMs) {
  try {
    // 休憩時間設定を取得
    const breakSettings = await chrome.storage.sync.get([
      "breakStart",
      "breakEnd",
    ]);
    const breakStart = breakSettings.breakStart || "13:00";
    const breakEnd = breakSettings.breakEnd || "14:00";

    // 休憩時間の重複を計算（bridge.jsのcalculateBreakOverlap関数と同等の処理）
    const breakOverlapMs = calculateBreakOverlap(startIso, endIso, breakStart, breakEnd);
    
    // 実労働時間（休憩時間を除外）
    const actualMs = originalMs - breakOverlapMs;
    
    log("Working time calculation:", { 
      startIso, endIso, originalMs, breakStart, breakEnd, breakOverlapMs, actualMs 
    });
    
    return Math.max(0, actualMs); // 負の値にならないように調整
  } catch (error) {
    log("Error calculating actual working time:", error);
    return originalMs; // エラー時は元の時間を返す
  }
}

// 休憩時間の重複する時間を計算（ミリ秒）- bridge.jsと同等の関数
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

// 区間を確定して GAS に書く
async function finalizeSegment(endIso, prevSeg) {
  if (!prevSeg?.start || !prevSeg.project)
    return { ok: false, reason: "no previous seg" };

  const ms = new Date(endIso) - new Date(prevSeg.start);
  if (!(ms > 0)) return { ok: false, reason: "invalid ms" };

  // 休憩時間を考慮した実労働時間を計算
  const actualMs = await calculateActualWorkingTime(prevSeg.start, endIso, ms);
  const val = quarterHoursDecimal(actualMs);
  
  const res = await postToGAS({
    endIso,
    projectName: prevSeg.project,
    valueDecimal: val,
  });

  log("GAS write:", { project: prevSeg.project, endIso, originalMs: ms, actualMs, val, res });
  return res;
}

// 休憩時間を考慮した値で直接スプレッドシートに書き込み（上書き）
async function rewriteSheetWithBreakTime({ endIso, projectName, actualValueDecimal }) {
  log("rewriteSheetWithBreakTime called with:", { endIso, projectName, actualValueDecimal: actualValueDecimal });

  try {
    if (!settings.sheetMode) {
      log("Sheet mode is disabled");
      return { ok: false, reason: "sheetMode off" };
    }

    if (
      !settings.sheetWebAppUrl ||
      (!settings.spreadsheetId && !settings.spreadsheetUrl)
    ) {
      const reason = "missing webAppUrl or spreadsheetId";
      log(reason, {
        sheetWebAppUrl: !!settings.sheetWebAppUrl,
        spreadsheetId: !!settings.spreadsheetId,
        spreadsheetUrl: !!settings.spreadsheetUrl
      });
      return { ok: false, reason };
    }

    // シート名・行
    const sheetName = monthSheetNameByFormat(settings.sheetNameFormat, endIso);
    const { day } = jstParts(endIso);
    const row = rowIndexForDay(day);
    
    log("Sheet calculation:", { sheetName, day, row, endIso });

    // SpreadSheet ID
    let spreadsheetId = settings.spreadsheetId;
    if (!spreadsheetId && settings.spreadsheetUrl) {
      const m = String(settings.spreadsheetUrl).match(
        /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
      );
      spreadsheetId = m ? m[1] : "";
    }
    if (!spreadsheetId) {
      log("spreadsheetId empty after extraction");
      return { ok: false, reason: "spreadsheetId empty" };
    }

    // ヘッダーを取得
    log("Getting headers for:", { sheetName, spreadsheetId });
    const headers = await getHeadersForMonth(sheetName, spreadsheetId);
    log("Retrieved headers:", headers);
    
    const letter = resolveColumnLetter(
      headers,
      settings.sheetHeaderStartCol || "B",
      projectName
    );
    if (!letter) {
      const reason = `header not found for project=${projectName}`;
      log(reason, { projectName, headers, startCol: settings.sheetHeaderStartCol });
      return { ok: false, reason };
    }

    log("Column resolved:", { projectName, letter });

    // WebアプリURLからトークンを抽出
    const token = extractTokenFromWebAppUrl(settings.sheetWebAppUrl);

    const body = {
      token: token,
      spreadsheetId,
      sheetName,
      row,
      values: [{ col: letter, value: actualValueDecimal }], // 累積された休憩時間考慮済みの値で上書き
      operation: "rewrite", // 再書き込みモードを指定
      rewrite: true // 後方互換性のため
    };

    log("Sending request to GAS:", body);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25秒でタイムアウト

    const res = await fetch(settings.sheetWebAppUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      keepalive: true,
    });

    clearTimeout(timeoutId);

    log("GAS response received:", { status: res.status, ok: res.ok });

    const responseText = await res.text();
    log("GAS response text:", responseText);

    const json = responseText ? JSON.parse(responseText) : {};
    const result = { ok: !!json.ok, status: res.status, json };

    log("Final rewrite result:", result);
    return result;
  } catch (e) {
    log("Rewrite error:", e.message || String(e));
    return { ok: false, error: e.message || String(e), stack: e.stack };
  }
}

// ===== Message handler =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "REWRITE_SHEET_WITH_BREAK") {
    // 休憩時間を考慮した再書き込み処理
    (async () => {
      let responseSent = false;
      
      const safeSendResponse = (response) => {
        if (!responseSent) {
          responseSent = true;
          try {
            sendResponse(response);
          } catch (e) {
            log("Error sending response:", e);
          }
        }
      };
      
      try {
        await loadSettings();
        
        const { inTime, outTime, team, project, actualMs } = msg.payload || {};
        
        log("REWRITE_SHEET_WITH_BREAK received:", { inTime, outTime, team, project, actualMs });
        
        if (!inTime || !outTime || !project || actualMs === undefined) {
          const errorMsg = "missing required parameters";
          log(errorMsg, { inTime: !!inTime, outTime: !!outTime, project: !!project, actualMs: actualMs });
          safeSendResponse({ ok: false, reason: errorMsg });
          return;
        }

        // 15分単位の小数値に変換（休憩時間考慮済みの実際の勤務時間から）
        const actualValueDecimal = quarterHoursDecimal(actualMs);
        
        log("Calling rewriteSheetWithBreakTime with:", { outTime, project, actualValueDecimal });
        
        const result = await rewriteSheetWithBreakTime({
          endIso: outTime,
          projectName: project,
          actualValueDecimal: actualValueDecimal
        });
        
        log("rewriteSheetWithBreakTime result:", result);
        safeSendResponse(result);
      } catch (error) {
        log("Error in REWRITE_SHEET_WITH_BREAK handler:", error);
        safeSendResponse({ ok: false, reason: error.message || String(error), error: String(error) });
      }
    })();
    
    return true; // async
  }

  // アラーム状況確認ハンドラー
  if (msg?.type === "CHECK_ALARMS") {
    (async () => {
      try {
        const alarms = await chrome.alarms.getAll();
        log("Current alarms:", alarms);
        sendResponse({ ok: true, alarms: alarms });
      } catch (error) {
        log("Error getting alarms:", error);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    
    return true; // async
  }

  // 通知テストハンドラー
  if (msg?.type === "TEST_NOTIFICATION") {
    (async () => {
      try {
        const { notificationType, preWorkNotifyMin } = msg;
        
        if (notificationType === "pre-work") {
          const minBefore = preWorkNotifyMin || 15;
          await chrome.notifications.create(`TEST_PRE_WORK_${Date.now()}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon48.png'),
            title: '【テスト】出勤時間のお知らせ',
            message: `${minBefore}分後に出社時刻です。出勤の準備をお忘れなく！（これはテスト通知です）`,
            buttons: [
              { title: 'MoneyForwardを開く' },
              { title: '後で通知' }
            ]
          });
        } else if (notificationType === "work-end") {
          await chrome.notifications.create(`TEST_WORK_END_${Date.now()}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon48.png'),
            title: '【テスト】退社時間のお知らせ',
            message: '退社時刻になりました。お疲れさまでした！（これはテスト通知です）',
            buttons: [
              { title: 'MoneyForwardを開く' },
              { title: 'スヌーズ' }
            ]
          });
        } else if (notificationType === "alarm-test") {
          // 30秒後にアラーム通知をテスト
          const testTime = Date.now() + 30000; // 30秒後
          await chrome.alarms.create("TEST_ALARM_30SEC", {
            when: testTime
          });
          log("Test alarm created for 30 seconds later:", new Date(testTime).toLocaleString('ja-JP'));
        }
        
        sendResponse({ ok: true });
      } catch (error) {
        log("Error in test notification:", error);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    
    return true; // async
  }

  // 通知スケジュール更新ハンドラー
  if (msg?.type === "UPDATE_NOTIFICATION_SCHEDULE") {
    (async () => {
      try {
        const { 
          workStart, 
          workEnd, 
          enableNotifications,
          enablePreWorkNotification,
          enableWorkEndNotification,
          preWorkNotifyMin, 
          enableWorkDays 
        } = msg;
        
        log("Updating notification schedule:", {
          workStart, workEnd, enableNotifications, 
          enablePreWorkNotification, enableWorkEndNotification,
          preWorkNotifyMin, enableWorkDays
        });

        // 既存のアラームをクリア
        await chrome.alarms.clearAll();
        
        if (enableNotifications && workStart && workEnd) {
          // 新しいアラームを設定
          await scheduleWorkNotifications(
            workStart, 
            workEnd, 
            preWorkNotifyMin || 15, 
            enableWorkDays !== false,
            enablePreWorkNotification !== false,
            enableWorkEndNotification !== false
          );
        }
        
        sendResponse({ ok: true });
      } catch (error) {
        log("Error updating notification schedule:", error);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    
    return true; // async
  }

  if (msg?.type !== "MF_BRIDGE_EVENT") return;

  (async () => {
    await loadSettings();
    
    // 設定読み込み確認
    log("Settings loaded in MF_BRIDGE_EVENT:", {
      debug: settings.debug,
      showNotificationOnSuccess: settings.showNotificationOnSuccess,
      enableDirectPost: settings.enableDirectPost
    });

    const { action, timestamp, pageUrl, pageTitle } = msg.payload || {};

    // team/project を補完（popup の project_switch には既に入っているが、clock_in/out には無い）
    let team = msg.payload?.team;
    let project = msg.payload?.project;
    if (!team || !project) {
      const cur = await getActiveTeamProjectNames();
      team = team || cur.teamName;
      project = project || cur.projectName;
    }

    const payload = { action, timestamp, pageUrl, pageTitle, team, project };

    // ---- Spreadsheetモードの処理 ----
    if (settings.sheetMode) {
      if (action === "clock_in") {
        await setSeg({ start: timestamp, team, project });
      } else if (action === "project_switch") {
        const prev = await getSeg();
        if (prev) {
          // 出勤中の場合のみログを残し、セグメントを更新
          await finalizeSegment(timestamp, prev);
          await setSeg({ start: timestamp, team, project });
          
          // ブリッジページを開く
          if (settings.targetPageUrl) {
            const url = buildUrlWithParams(settings.targetPageUrl, payload);
            await openBridge(url);
          }
        } else {
          // 退勤中の場合はログを残さない（popup.jsでの切替のみ実行）
          log("Project switch during off-duty - no log created, popup switch only");
        }
      } else if (action === "clock_out") {
        const prev = await getSeg();
        if (prev) await finalizeSegment(timestamp, prev);
        await clearSeg();
      }
    }

    // ---- 既存動作（任意の API POST / bridge.html オープン）----
    // project_switch時に退勤中の場合はブリッジページを開かない
    if (action === "project_switch") {
      const currentSeg = await getSeg();
      if (!currentSeg) {
        log("Project switch during off-duty - bridge.html will not be opened");
        return; // 早期リターンでブリッジページ開封とAPI送信をスキップ
      }
    }
    
    let ok = false;
    if (settings.enableDirectPost && settings.targetApiUrl) {
      try {
        ok = await postDirect(payload);
      } catch (e) {
        log("direct post failed:", e);
        ok = false;
      }
    }

    if (!settings.enableDirectPost || !ok) {
      await openBridgeTab(payload);
      ok = true;
    }

    // 通知設定をログ出力
    log("Notification check:", { 
      ok, 
      showNotificationOnSuccess: settings.showNotificationOnSuccess,
      action,
      timestamp 
    });

    if (ok && settings.showNotificationOnSuccess) {
      log("Creating success notification for action:", action);
      try {
        await chrome.notifications.create(`mf-bridge-${Date.now()}`, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/icon128.png"),
          title: "勤怠記録を送信しました",
          message: `${
            action === "clock_in"
              ? "出勤"
              : action === "clock_out"
              ? "退勤"
              : "プロジェクト切替"
          }：${new Date(timestamp).toLocaleString()}`,
          priority: 0,
        });
        log("Success notification created successfully");
      } catch (error) {
        log("Error creating success notification:", error);
      }
    } else {
      log("Success notification skipped:", { ok, showNotificationOnSuccess: settings.showNotificationOnSuccess });
    }
    sendResponse({ ok, spreadsheet: settings.sheetMode });
  })();

  return true; // async
});

// ===== 通知システム =====

// 出社時間通知のスケジューリング関数
// 指定された出社・退社時間に基づいてアラームを設定する
async function scheduleWorkNotifications(workStart, workEnd, preWorkNotifyMin, enableWorkDays, enablePreWorkNotification, enableWorkEndNotification) {
  log("=== scheduleWorkNotifications called ===");
  log("Parameters:", { 
    workStart, workEnd, preWorkNotifyMin, enableWorkDays,
    enablePreWorkNotification, enableWorkEndNotification
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  log("Current time:", {
    now: now.toLocaleString('ja-JP'),
    nowMs: now.getTime(),
    today: today.toLocaleString('ja-JP'),
    todayMs: today.getTime()
  });

  try {
    // まず既存のアラームをすべてクリア
    await chrome.alarms.clearAll();
    log("All existing alarms cleared");

    // 出社前通知の設定
    if (enablePreWorkNotification && workStart) {
      const [workStartHour, workStartMin] = workStart.split(':').map(Number);
      log("Parsed work start time:", { workStartHour, workStartMin, preWorkNotifyMin });
      
      const preWorkTime = new Date(today);
      preWorkTime.setHours(workStartHour, workStartMin - preWorkNotifyMin, 0, 0);
      
      log("Initial pre-work time:", {
        preWorkTime: preWorkTime.toLocaleString('ja-JP'),
        preWorkTimeMs: preWorkTime.getTime(),
        isPast: preWorkTime <= now
      });

      // 今日の通知が既に過ぎている場合は明日に設定
      if (preWorkTime <= now) {
        preWorkTime.setDate(preWorkTime.getDate() + 1);
        log("Pre-work time moved to tomorrow:", {
          preWorkTime: preWorkTime.toLocaleString('ja-JP'),
          preWorkTimeMs: preWorkTime.getTime()
        });
      }

      await chrome.alarms.create("PRE_WORK_NOTIFICATION", {
        when: preWorkTime.getTime()
      });
      
      log("Pre-work alarm created successfully:", {
        name: "PRE_WORK_NOTIFICATION",
        when: preWorkTime.getTime(),
        whenStr: preWorkTime.toLocaleString('ja-JP')
      });
    } else {
      log("Pre-work notification skipped:", { enablePreWorkNotification, workStart });
    }

    // 退社時通知の設定
    if (enableWorkEndNotification && workEnd) {
      const [workEndHour, workEndMin] = workEnd.split(':').map(Number);
      log("Parsed work end time:", { workEndHour, workEndMin });
      
      const workEndTime = new Date(today);
      workEndTime.setHours(workEndHour, workEndMin, 0, 0);
      
      log("Initial work end time:", {
        workEndTime: workEndTime.toLocaleString('ja-JP'),
        workEndTimeMs: workEndTime.getTime(),
        isPast: workEndTime <= now
      });

      // 今日の通知が既に過ぎている場合は明日に設定
      if (workEndTime <= now) {
        workEndTime.setDate(workEndTime.getDate() + 1);
        log("Work end time moved to tomorrow:", {
          workEndTime: workEndTime.toLocaleString('ja-JP'),
          workEndTimeMs: workEndTime.getTime()
        });
      }

      await chrome.alarms.create("WORK_END_NOTIFICATION", {
        when: workEndTime.getTime()
      });
      
      log("Work end alarm created successfully:", {
        name: "WORK_END_NOTIFICATION", 
        when: workEndTime.getTime(),
        whenStr: workEndTime.toLocaleString('ja-JP')
      });
    } else {
      log("Work end notification skipped:", { enableWorkEndNotification, workEnd });
    }

    // 作成したアラームの確認
    const alarms = await chrome.alarms.getAll();
    log("Final alarm list:", alarms);
    log("=== scheduleWorkNotifications completed ===");

  } catch (error) {
    log("Error in scheduleWorkNotifications:", error);
  }
}


// 平日判定関数（月曜日=1, 日曜日=0）
function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5; // 月曜日〜金曜日
}

// MoneyForwardのURLを取得する関数
async function getMoneyForwardUrl() {
  try {
    // 設定からMFのURLを取得（options.jsで設定されているURL）
    const result = await chrome.storage.sync.get(['mfBaseUrl']);
    if (result.mfBaseUrl && result.mfBaseUrl.trim()) {
      return result.mfBaseUrl.trim();
    }
  } catch (error) {
    log("Error getting MoneyForward URL from settings:", error);
  }
  
  // デフォルトのMoneyForward勤怠URL
  return "https://attendance.moneyforward.com/my_page";
}

// アラーム発火時の処理
chrome.alarms.onAlarm.addListener(async (alarm) => {
  log("Alarm fired:", alarm.name);

  try {
    // 設定を読み込み
    const settings = await chrome.storage.sync.get([
      'enableNotifications',
      'enablePreWorkNotification',
      'enableWorkEndNotification',
      'enableWorkDays',
      'workStart',
      'workEnd',
      'preWorkNotifyMin'
    ]);

    // 通知が無効化されている場合は何もしない
    if (!settings.enableNotifications) {
      log("Notifications disabled, skipping");
      return;
    }

    // 平日のみ通知が有効で、今日が休日の場合はスキップ
    if (settings.enableWorkDays && !isWeekday(new Date())) {
      log("Weekday-only notifications enabled, but today is weekend, skipping");
      // 明日のアラームを設定
      await scheduleWorkNotifications(
        settings.workStart, 
        settings.workEnd, 
        settings.preWorkNotifyMin, 
        settings.enableWorkDays,
        settings.enablePreWorkNotification,
        settings.enableWorkEndNotification
      );
      return;
    }

    const mfUrl = await getMoneyForwardUrl();

    if (alarm.name === "PRE_WORK_NOTIFICATION") {
      // 出社前通知の個別設定チェック
      if (!settings.enablePreWorkNotification) {
        log("Pre-work notification disabled, skipping");
        return;
      }
      
      const minBefore = settings.preWorkNotifyMin || 15;
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: '出勤時間のお知らせ',
        message: `${minBefore}分後に出社時刻です。出勤の準備をお忘れなく！`,
        buttons: [
          { title: 'MoneyForwardを開く' },
          { title: '後で通知' }
        ]
      });

    } else if (alarm.name === "WORK_END_NOTIFICATION") {
      // 退社通知の個別設定チェック
      if (!settings.enableWorkEndNotification) {
        log("Work end notification disabled, skipping");
        return;
      }
      
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'), 
        title: '退社時間のお知らせ',
        message: '退社時刻になりました。お疲れさまでした！',
        buttons: [
          { title: 'MoneyForwardを開く' },
          { title: 'スヌーズ' }
        ]
      });
    } else if (alarm.name.startsWith("SNOOZE_")) {
      // スヌーズアラーム（5分後の再通知）
      await chrome.notifications.create(`SNOOZE_REPEAT_${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: '退社時間のお知らせ（再通知）',
        message: '退社時刻を過ぎています。お疲れさまでした！',
        buttons: [
          { title: 'MoneyForwardを開く' },
          { title: '再度スヌーズ' }
        ]
      });
    } else if (alarm.name === "TEST_ALARM_30SEC") {
      // 30秒テストアラーム
      log("Test alarm fired successfully!");
      await chrome.notifications.create(`TEST_ALARM_SUCCESS_${Date.now()}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: '【テスト成功】アラーム機能',
        message: 'アラーム機能が正常に動作しています！（30秒後テスト）',
        buttons: [
          { title: 'OK' }
        ]
      });
    }

    // 翌日のアラームを設定
    await scheduleWorkNotifications(
      settings.workStart, 
      settings.workEnd, 
      settings.preWorkNotifyMin, 
      settings.enableWorkDays,
      settings.enablePreWorkNotification,
      settings.enableWorkEndNotification
    );

  } catch (error) {
    log("Error in alarm handler:", error);
  }
});

// 通知クリック時の処理
chrome.notifications.onClicked.addListener(async (notificationId) => {
  log("Notification clicked:", notificationId);
  
  try {
    const mfUrl = await getMoneyForwardUrl();
    // MoneyForwardを新しいタブで開く
    await chrome.tabs.create({ url: mfUrl });
    
    // 通知を削除
    await chrome.notifications.clear(notificationId);
  } catch (error) {
    log("Error handling notification click:", error);
  }
});

// 通知ボタンクリック時の処理
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  log("Notification button clicked:", notificationId, buttonIndex);

  try {
    if (buttonIndex === 0) {
      // MoneyForwardを開く
      const mfUrl = await getMoneyForwardUrl();
      await chrome.tabs.create({ url: mfUrl });
      await chrome.notifications.clear(notificationId);

    } else if (buttonIndex === 1) {
      // スヌーズまたは後で通知
      await chrome.notifications.clear(notificationId);
      
      // スヌーズメニューを表示する代わりに、デフォルトで5分後に再通知
      const snoozeMinutes = 5;
      const snoozeTime = Date.now() + (snoozeMinutes * 60 * 1000);
      
      await chrome.alarms.create(`SNOOZE_${Date.now()}`, {
        when: snoozeTime
      });
      
      // スヌーズ通知を作成
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: 'スヌーズ設定完了',
        message: `${snoozeMinutes}分後に再度通知します。`
      });
    }
  } catch (error) {
    log("Error handling notification button click:", error);
  }
});

// 拡張機能の初期化時に通知スケジュールを設定
chrome.runtime.onStartup.addListener(async () => {
  try {
    const settings = await chrome.storage.sync.get([
      'workStart',
      'workEnd', 
      'enableNotifications',
      'enablePreWorkNotification',
      'enableWorkEndNotification',
      'preWorkNotifyMin',
      'enableWorkDays'
    ]);

    if (settings.enableNotifications && settings.workStart && settings.workEnd) {
      await scheduleWorkNotifications(
        settings.workStart,
        settings.workEnd,
        settings.preWorkNotifyMin || 15,
        settings.enableWorkDays !== false,
        settings.enablePreWorkNotification !== false,
        settings.enableWorkEndNotification !== false
      );
    }
  } catch (error) {
    log("Error initializing notifications on startup:", error);
  }
});

// インストール時の初期化
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const settings = await chrome.storage.sync.get([
      'workStart',
      'workEnd',
      'enableNotifications',
      'enablePreWorkNotification',
      'enableWorkEndNotification',
      'preWorkNotifyMin',
      'enableWorkDays'
    ]);

    if (settings.enableNotifications && settings.workStart && settings.workEnd) {
      await scheduleWorkNotifications(
        settings.workStart,
        settings.workEnd,
        settings.preWorkNotifyMin || 15,
        settings.enableWorkDays !== false,
        settings.enablePreWorkNotification !== false,
        settings.enableWorkEndNotification !== false
      );
    }
  } catch (error) {
    log("Error initializing notifications on install:", error);
  }
});
