// ===== テーマ管理（Auto / Light / Dark） =====
// ユーザーのシステム設定や手動選択に基づいてダーク/ライトモードを切り替え

class ThemeManager {
  constructor(storageKey = "theme_mode") {
    this.storageKey = storageKey;
    this.root = document.documentElement;
    this.media = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    this.init();
  }

  getSystemTheme() {
    return (this.media && this.media.matches) ? "dark" : "light";
  }

  applyTheme(mode) {
    const theme = mode === "auto" ? this.getSystemTheme() : mode;
    this.root.setAttribute("data-theme", theme);
  }

  readMode() {
    const saved = localStorage.getItem(this.storageKey);
    return (saved === "light" || saved === "dark") ? saved : "auto";
  }

  writeMode(mode) {
    localStorage.setItem(this.storageKey, mode);
  }

  updateButtonLabel(btn) {
    if (!btn) return;
    const mode = this.readMode();
    
    btn.textContent = mode === "auto" ? "🌗" : mode === "light" ? "🌞" : "🌙";
    btn.title = `テーマ: ${
      mode === "auto" ? "自動（システム）" : mode === "light" ? "ライト" : "ダーク"
    } - クリックで切替`;
  }

  setupThemeToggle(buttonId) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    this.updateButtonLabel(btn);
    btn.addEventListener("click", () => {
      const current = this.readMode();
      const next = current === "auto" ? "light" : current === "light" ? "dark" : "auto";
      this.writeMode(next);
      this.applyTheme(next);
      this.updateButtonLabel(btn);
    });
  }

  init() {
    // 初期化：保存されたテーマまたはAuto（既定）で適用
    this.applyTheme(this.readMode());

    // システムテーマ変更の監視
    if (this.media?.addEventListener) {
      this.media.addEventListener("change", () => {
        if (this.readMode() === "auto") {
          this.applyTheme("auto");
        }
      });
    } else if (this.media?.addListener) {
      this.media.addListener(() => {
        if (this.readMode() === "auto") {
          this.applyTheme("auto");
        }
      });
    }
  }
}

// グローバルに公開（ES6モジュールが使えない環境向け）
window.ThemeManager = ThemeManager;