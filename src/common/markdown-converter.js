// ===== MarkDown to HTML変換 =====
// 共通のMarkDown変換機能

class MarkdownConverter {
  static convert(md) {
    if (!md) return "";
    md = md.replace(/\r\n?/g, "\n").trim();

    // インライン要素の変換
    md = md
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

    // 見出しの変換
    md = md
      .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
      .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
      .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

    // リスト（連続する "- " 行のブロックだけを <ul> に包む）
    md = md.replace(/(^|\n)(-\s+.+(?:\n-\s+.+)*)/g, (_, lead, block) => {
      const items = block
        .trim()
        .split("\n")
        .map(line => line.replace(/^\-\s+(.+)$/, "<li>$1</li>"))
        .join("");
      return `${lead}<ul>${items}</ul>`;
    });

    // 段落処理：空行（2つ以上の改行）で分割してブロックを作成
    const blocks = md.split(/\n{2,}/).map(block => {
      block = block.trim();
      if (!block) return "";
      
      // 既にHTML要素の場合はそのまま返す
      if (/^<(h[1-3]|ul|ol|li|div|p)\b/i.test(block)) {
        return block;
      }
      
      // 通常のテキストブロック：単一改行を<br>に変換して段落でラップ
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    });

    return blocks.filter(block => block).join("\n\n");
  }
}

// グローバルに公開（ES6モジュールが使えない環境向け）
window.MarkdownConverter = MarkdownConverter;

// 後方互換性のための関数エクスポート
window.markdownToHtml = MarkdownConverter.convert;