// ===== 共通ユーティリティ関数 =====

class Utils {
  // 日本時間フォーマット
  static fmtJP(iso) {
    try {
      const d = new Date(iso);
      
      const parts = new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit", 
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).formatToParts(d);
      
      const year = parts.find(part => part.type === 'year').value;
      const month = parts.find(part => part.type === 'month').value;
      const day = parts.find(part => part.type === 'day').value;
      const hour = parts.find(part => part.type === 'hour').value;
      const minute = parts.find(part => part.type === 'minute').value;
      const second = parts.find(part => part.type === 'second').value;
      
      const m = parseInt(month, 10);
      const da = parseInt(day, 10);
      
      return `${year}年${m}月${da}日 ${hour}時${minute}分${second}秒`;
    } catch {
      return iso;
    }
  }

  // UTC短縮フォーマット
  static fmtUTCshort(iso) {
    try {
      const d = new Date(iso);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const da = String(d.getUTCDate()).padStart(2, "0");
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mm = String(d.getUTCMinutes()).padStart(2, "0");
      const ss = String(d.getUTCSeconds()).padStart(2, "0");
      return `${y}-${m}-${da} ${hh}:${mm}:${ss} UTC`;
    } catch {
      return iso;
    }
  }

  // CSVエスケープ処理
  static csvEscape(v) {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
  }

  // actionを日本語に変換
  static translateAction(action) {
    switch (action) {
      case "clock_in": return "出勤";
      case "clock_out": return "退勤";
      case "project_switch": return "切替";
      default: return action;
    }
  }

  // pageを日本語に変換
  static translatePage(page) {
    return page === "project switch" ? "プロジェクト切替" : (page || "");
  }

  // 時刻の精密フォーマット
  static formatPreciseHMS(ms, showBreakInfo = false, breakMs = 0) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const parts = [];
    if (h) parts.push(`${h}時間`);
    if (m) parts.push(`${m}分`);
    if (sec || parts.length === 0) parts.push(`${sec}秒`);

    let result = parts.join("");

    if (showBreakInfo && breakMs > 0) {
      const breakMin = Math.floor(breakMs / 60000);
      result += ` (休憩${breakMin}分除外)`;
    }

    return result;
  }

  // 15分単位フォーマット
  static formatQuarterHours(units) {
    const val = units / 4;
    return Number.isInteger(val) ? String(val) : val.toFixed(2).replace(/\.?0+$/, "");
  }

  // 現在の年月に基づいたシート名生成
  static monthSheetName(d = new Date()) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return `${y}年${m}月`;
  }

  // シートURLからIDを抽出
  static extractSheetId(url) {
    const m = String(url || "").match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : null;
  }
}

// グローバルに公開
window.Utils = Utils;

// 後方互換性のための関数エクスポート
window.fmtJP = Utils.fmtJP;
window.fmtUTCshort = Utils.fmtUTCshort;
window.csvEscape = Utils.csvEscape;
window.translateAction = Utils.translateAction;
window.translatePage = Utils.translatePage;
window.formatPreciseHMS = Utils.formatPreciseHMS;
window.formatQuarterHours = Utils.formatQuarterHours;