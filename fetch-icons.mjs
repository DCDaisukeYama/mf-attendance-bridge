// fetch-icons.mjs
import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import sharp from "sharp";

// 使いたいアイコン名（Material Symbolsの名前）
// 例: 'schedule', 'alarm', 'login', 'logout', 'punch_clock' 等
const ICON_NAME = "punch_clock"; // ←好みで変更可（"schedule"でもOK）

// Material Symbols Outlined の公開SVG（Google Fonts CDN）
// サイズは 48px 版を取得しますが、SVGなのでsharpで任意サイズにレンダリングできます。
const SVG_URL = `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/${ICON_NAME}/default/48px.svg`;

const OUT_DIR = path.join(process.cwd(), "icons");
const OUTS = [
  { name: "icon16.png", size: 16 },
  { name: "icon32.png", size: 32 },
  { name: "icon48.png", size: 48 },
  { name: "icon128.png", size: 128 },
];

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on("data", (d) => chunks.push(d));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  console.log(`[icons] Fetching SVG: ${SVG_URL}`);
  const svg = await fetchBuffer(SVG_URL);

  // 念のため色が currentColor の場合は黒(#000)に置換（必要なければコメントアウト可）
  let svgText = svg.toString("utf8").replace(/currentColor/g, "#000");
  // 透明背景PNGにしたいので特に背景は入れません

  for (const { name, size } of OUTS) {
    const outPath = path.join(OUT_DIR, name);
    const png = await sharp(Buffer.from(svgText))
      .resize(size, size, { fit: "contain" })
      .png()
      .toBuffer();
    await fs.writeFile(outPath, png);
    console.log(`[icons] Wrote ${outPath} (${size}x${size})`);
  }

  console.log("[icons] Done ✅");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
