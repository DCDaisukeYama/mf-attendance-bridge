// ===== content.js (robust debug build with defaults) =====
// MoneyForwardのページに注入されるコンテンツスクリプト
// 出勤・退勤ボタンのクリックを検知してbackground.jsにメッセージを送信
// コンテンツスクリプトのデフォルト設定
// キーワードとCSSセレクタで勤怠ボタンを特定
const DEFAULTS = {
  inKeywords: ["出勤", "出社", "打刻開始", "勤務開始", "check in", "clock in"],
  outKeywords: [
    "退勤",
    "退社",
    "打刻終了",
    "勤務終了",
    "check out",
    "clock out",
  ],
  inSelectors: [".clock_in .time-stamp-button"], // 既定でセット
  outSelectors: [".clock_out .time-stamp-button"], // 既定でセット
  debounceMs: 1200,
  debug: true,
  // breakStartSelectors / breakEndSelectors は必要時に options で追加
};

// 現在の設定を保持する変数
let cfg = { ...DEFAULTS };

// デバウンス用 - 前回のイベント発火時刻
let lastFiredAt = 0;

// クリック可能な勤怠ボタンを特定するセレクタ群
const CLICKABLE_SEL = [
  "button.time-stamp-button",
  ".clock_in .time-stamp-button",
  ".clock_out .time-stamp-button",
  ".start_break .time-stamp-button",
  ".end_break .time-stamp-button",
].join(",");

// Chrome拡張機能のruntime APIが使用可能かチェック
function hasChromeRuntime() {
  return (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.sendMessage
  );
}

// Chrome拡張機能のstorage APIが使用可能かチェック
function hasChromeStorage() {
  return typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync;
}

// デバッグ用ログ出力関数
function log(...args) {
  if (cfg.debug) console.log("[MF-Bridge]", ...args);
}

// HTML要素からテキストを抽出して正規化（空白除去など）
function normalizeText(el) {
  if (!el) return "";
  const t = (
    el.innerText ||
    el.value ||
    el.getAttribute("aria-label") ||
    ""
  ).trim();
  return t.replace(/\s+/g, "");
}

// 要素のテキストが指定されたキーワードにマッチするかチェック
function matchesKeywords(el, kws) {
  const t = normalizeText(el);
  return !!t && kws.some((kw) => t.includes(kw));
}

// 要素が指定されたCSSセレクタにマッチするかチェック
function matchesSelectors(el, sels) {
  if (!el || !sels || !sels.length) return false;
  for (const sel of sels) {
    try {
      if (el.matches?.(sel)) return true;
      if (el.closest?.(sel)) return true;
    } catch {}
  }
  return false;
}

// Chromeストレージから設定を読み込む関数
async function loadCfg() {
  log("boot on", location.href);
  if (hasChromeStorage()) {
    try {
      const saved = await chrome.storage.sync.get(Object.keys(DEFAULTS));
      cfg = { ...DEFAULTS, ...saved };
      log("loaded cfg:", cfg);
      return;
    } catch (e) {
      console.warn("[MF-Bridge] storage read failed:", e);
    }
  }
  cfg = { ...DEFAULTS };
  log("use defaults (no storage)");
}

// クリックされた要素から勤怠アクションを判定する
// セレクタ優先、なければキーワードで判定
function decideActionByNode(node) {
  const hasAnySelector =
    (cfg.inSelectors && cfg.inSelectors.length) ||
    (cfg.outSelectors && cfg.outSelectors.length) ||
    (cfg.breakStartSelectors && cfg.breakStartSelectors.length) ||
    (cfg.breakEndSelectors && cfg.breakEndSelectors.length);

  if (matchesSelectors(node, cfg.inSelectors)) return "clock_in";
  if (matchesSelectors(node, cfg.outSelectors)) return "clock_out";
  if (matchesSelectors(node, cfg.breakStartSelectors)) return "break_start";
  if (matchesSelectors(node, cfg.breakEndSelectors)) return "break_end";

  if (hasAnySelector) return null; // セレクタがあればキーワードは無効化（誤検知防止）

  if (matchesKeywords(node, cfg.inKeywords)) return "clock_in";
  if (matchesKeywords(node, cfg.outKeywords)) return "clock_out";

  return null;
}

// イベントのcomposedPath()からクリック可能な要素とアクションを探す
function findClickableAndActionFromPath(path) {
  for (const n of path) {
    if (!(n instanceof Element)) continue;

    if (n.matches?.(CLICKABLE_SEL)) {
      const a = decideActionByNode(n);
      if (a) return { node: n, action: a, reason: "clickable matched" };
    }

    const a = decideActionByNode(n);
    if (a) return { node: n, action: a, reason: "text/selector matched" };
  }
  return null;
}

// クリックイベントのメインハンドラー
// pointerdownやclickイベントを処理し、勤怠ボタンかどうか判定
function onAnyClickLike(e, phase) {
  if (!hasChromeRuntime()) return;

  const now = Date.now();
  if (now - lastFiredAt < cfg.debounceMs) return;

  const path = e.composedPath ? e.composedPath() : [e.target];
  const hit = findClickableAndActionFromPath(path);

  if (!hit) {
    log(`${phase} miss`, {
      target:
        e.target && e.target.outerHTML
          ? e.target.outerHTML.slice(0, 120) + "..."
          : String(e.target),
      text: normalizeText(e.target),
    });
    return;
  }

  lastFiredAt = now;

  const payload = {
    action: hit.action,
    timestamp: new Date().toISOString(),
    pageUrl: location.href,
    pageTitle: document.title,
  };

  log(`${phase} hit ->`, {
    action: hit.action,
    reason: hit.reason,
    node: hit.node.tagName,
    text: normalizeText(hit.node),
  });

  try {
    chrome.runtime.sendMessage({ type: "MF_BRIDGE_EVENT", payload }, (res) => {
      log("message sent, bg response:", res);
    });
  } catch (err) {
    console.error("[MF-Bridge] sendMessage failed:", err);
  }
}

// コンテンツスクリプトの初期化関数
// 設定読み込みとイベントリスナーの設定
(async function init() {
  await loadCfg();

  window.addEventListener(
    "pointerdown",
    (e) => onAnyClickLike(e, "pointerdown"),
    true
  );
  window.addEventListener("click", (e) => onAnyClickLike(e, "click"), true);

  const mo = new MutationObserver(() => {});
  mo.observe(document.documentElement, { childList: true, subtree: true });

  log("content ready");
})();
