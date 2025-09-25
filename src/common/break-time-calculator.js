// ===== 休憩時間計算ユーティリティ =====
// 出勤・退勤時間と休憩時間設定から実労働時間を計算

class BreakTimeCalculator {
  /**
   * 休憩時間の重複する時間を計算（ミリ秒）
   * @param {string} inTime - 出勤時刻（ISO形式）
   * @param {string} outTime - 退勤時刻（ISO形式）
   * @param {string} breakStart - 休憩開始時刻（HH:MM形式）
   * @param {string} breakEnd - 休憩終了時刻（HH:MM形式）
   * @returns {number} 重複する休憩時間（ミリ秒）
   */
  static calculateBreakOverlap(inTime, outTime, breakStart, breakEnd) {
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

  /**
   * 実労働時間を計算（休憩時間を考慮）
   * @param {string} startTime - 開始時刻（ISO形式）
   * @param {string} endTime - 終了時刻（ISO形式）
   * @param {string} breakStart - 休憩開始時刻（HH:MM形式）
   * @param {string} breakEnd - 休憩終了時刻（HH:MM形式）
   * @returns {number} 実労働時間（ミリ秒）
   */
  static calculateActualWorkingTime(startTime, endTime, breakStart, breakEnd) {
    const totalMs = new Date(endTime) - new Date(startTime);
    if (totalMs <= 0) return 0;

    const breakOverlapMs = this.calculateBreakOverlap(startTime, endTime, breakStart, breakEnd);
    return Math.max(0, totalMs - breakOverlapMs);
  }

  /**
   * 15分単位での労働時間を計算
   * @param {number} ms - 労働時間（ミリ秒）
   * @returns {number} 15分単位での時間（小数）
   */
  static quarterHoursDecimal(ms) {
    const quarterUnits = Math.round(ms / (15 * 60 * 1000)); // 15分単位
    return quarterUnits / 4; // 0.25刻みの小数（2.25 など）
  }
}

// グローバルに公開（ES6モジュールが使えない環境向け）
window.BreakTimeCalculator = BreakTimeCalculator;

// 後方互換性のための関数エクスポート
window.calculateBreakOverlap = BreakTimeCalculator.calculateBreakOverlap;