// 勤怠データを受け取るブリッジページのJavaScript
// URLパラメータから勤怠情報を取得し、ローカル保存とAPI送信を行う

// ---- テーマ管理（Auto / Light / Dark） ----
// ユーザーのシステム設定や手動選択に基づいてダーク/ライトモードを切り替え
(function setupTheme(){
  const root = document.documentElement;
  const media = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
  const getSystemTheme = () => (media && media.matches) ? "dark" : "light";

  const MODE_KEY = "bridge_theme_mode"; // "auto" | "light" | "dark"
  function applyTheme(mode){
    const t = (mode === "auto") ? getSystemTheme() : mode;
    root.setAttribute("data-theme", t);
  }
  function readMode(){
    const saved = localStorage.getItem(MODE_KEY);
    return saved === "light" || saved === "dark" ? saved : "auto";
  }
  function writeMode(mode){
    localStorage.setItem(MODE_KEY, mode);
  }
  function updateButtonLabel(btn){
    if(!btn) return;
    const m = readMode();
    btn.textContent = m === "auto" ? "🌗 自動（システム）" : (m === "light" ? "🌞 ライト" : "🌙 ダーク");
    btn.title = "クリックで Auto / Light / Dark を切替";
  }

  // 初期化：Auto（既定）で適用
  applyTheme(readMode());

  // システム変更を自動追随（Auto時のみ）
  if (media && media.addEventListener) {
    media.addEventListener("change", () => {
      if (readMode() === "auto") applyTheme("auto");
    });
  } else if (media && media.addListener) {
    // 古いブラウザ用
    media.addListener(() => {
      if (readMode() === "auto") applyTheme("auto");
    });
  }

  // UIボタン
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
  });
})();
// API連携用のグローバル設定（必要に応じて有効化）
// window.ATTENDANCE_API_URL = "https://your-domain.example/api/attendance/log"; // 使うときだけ有効化
// window.ATTENDANCE_API_KEY = "YOUR_BEARER_TOKEN";

// 日本時間表示用のタイムゾーン設定
const tzJP = 'Asia/Tokyo';
// ISO文字列を日本時間でフォーマット
const fmtJP = (iso) => { try { return new Date(iso).toLocaleString('ja-JP',{ timeZone: tzJP, hour12:false }); } catch { return iso; } };
// ISO文字列をUTC時間で表示用にフォーマット
const fmtUTC = (iso) => { try { return new Date(iso).toISOString().replace('T',' ').replace('Z',' UTC'); } catch { return iso; } };
// localStorageから勤怠ログを読み込み
function loadLogs(){ try { return JSON.parse(localStorage.getItem('attendanceLogs')||'[]'); } catch { return []; } }
// 勤怠ログをlocalStorageに保存
function saveLogs(logs){ localStorage.setItem('attendanceLogs', JSON.stringify(logs)); }
// 設定されたAPIエンドポイントに勤怠データをPOST送信
async function postAPI(payload){
  if(!window.ATTENDANCE_API_URL) return { ok:false, skipped:true };
  try{
    const res = await fetch(window.ATTENDANCE_API_URL,{
      method:'POST',
      headers:{ 'Content-Type':'application/json', ...(window.ATTENDANCE_API_KEY?{Authorization:`Bearer ${window.ATTENDANCE_API_KEY}`}:{}) },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  }catch(e){ return { ok:false, error: String(e) } }
}
// CSVエクスポート用の文字列エスケープ処理
function csvEscape(v){ if(v==null) return ''; const s=String(v); return /[",\n]/.test(s)? '"'+s.replaceAll('"','""')+'"' : s }
// 勤怠ログをCSVファイルとしてエクスポート
function exportCSV(rows, filename='attendance_logs.csv'){
  const header = ['id','action','timestamp','timestamp_jst','source','page','ref'];
  const lines = [header.join(',')].concat(rows.map(r=>[
    r.id, r.action, r.timestamp, fmtJP(r.timestamp), r.source||'', r.page||'', r.ref||''
  ].map(csvEscape).join(',')));
  const blob = new Blob(["\ufeff"+lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}

// メイン処理 - ページ読み込み完了時の初期化
document.addEventListener('DOMContentLoaded', async () => {
  // URLパラメータから勤怠情報を取得
  const params = new URLSearchParams(location.search);
  const action = params.get('action');
  const timestamp = params.get('timestamp');
  const source = params.get('source');
  const page = params.get('page');
  const ref = params.get('ref');

  const statusEl = document.getElementById('status');
  const tableBody = document.getElementById('tbody');
  const latestEl = document.getElementById('latest');
  const apiStatusEl = document.getElementById('apiStatus');

  // 保存された勤怠ログを読み込み
  let logs = loadLogs();
  // 状態管理用のフラグ
  let justRecorded = false; let duplicate = false;

  // 新しい勤怠イベントの処理
  if(action && timestamp){
    // 重複チェック - 同じactionとtimestampの組み合わせが既に存在するか
    const exists = logs.some(l => l.action===action && l.timestamp===timestamp);
    if(!exists){ // 新規レコードの場合
      // 新しいレコードを作成して保存
      const rec = { id: Date.now(), action, timestamp, source, page, ref };
      logs.push(rec); saveLogs(logs); justRecorded = true; // ローカル保存
      // API連携を試行
      const apiRes = await postAPI(rec);
      // API送信結果をUIに表示
      if(apiStatusEl){
        if(apiRes.skipped){ apiStatusEl.textContent = 'API連携: 未設定（ローカル保存のみ）'; apiStatusEl.className='muted small'; }
        else if(apiRes.ok){ apiStatusEl.textContent = `API連携: 成功 (${apiRes.status})`; apiStatusEl.className='small'; }
        else{ apiStatusEl.textContent = `API連携: 失敗${apiRes.status?` (${apiRes.status})`:''}${apiRes.error?` - ${apiRes.error}`:''}`; apiStatusEl.className='small'; }
      }
    } else { // 重複イベントの場合
      duplicate = true;
    }
  }

  // 現在のイベントのステータス表示を更新
  if(action && timestamp){
    const ok = logs.some(l => l.action===action && l.timestamp===timestamp);
    const label = action==='clock_in' ? '出勤' : action==='clock_out' ? '退勤' : action;
    statusEl.innerHTML = ok
      ? `<span class="stat"><span class="dot okdot"></span>記録済み: <b>${label}</b> / <b>${fmtJP(timestamp)}</b></span>`
      : `<span class="stat"><span class="dot errdot"></span>未記録</span>`;
    if(duplicate){
      statusEl.insertAdjacentHTML('beforeend', ` <span class="badge warn">重複イベント（保存はスキップ）</span>`);
    }else if(justRecorded){
      statusEl.insertAdjacentHTML('beforeend', ` <span class="badge in">新規保存</span>`);
    }
  } else { // actionやtimestampがない場合
    statusEl.innerHTML = `<span class="stat"><span class="dot warndot"></span>待機中：URLに <code>action</code> と <code>timestamp</code> がありません</span>`;
  }

  // 最新の勤怠記録を表示
  const latest = logs[logs.length-1];
  const lab = latest ? (latest.action==='clock_in' ? '出勤' : latest.action==='clock_out' ? '退勤' : latest.action) : '';
  latestEl.innerHTML = latest
    ? `<div class="row" style="gap:12px;flex-wrap:wrap">
         <span class="badge ${latest.action==='clock_in'?'in':'out'}">${lab}</span>
         <span>${fmtJP(latest.timestamp)}</span>
         <span class="muted small">(UTC: ${fmtUTC(latest.timestamp)})</span>
         ${latest.source?`<span class="muted small">from: ${latest.source}</span>`:''}
       </div>`
    : `<span class="muted">まだ記録がありません</span>`;

  // 勤怠ログのテーブル表示を更新
  function renderTable(){
    tableBody.innerHTML = '';
    const rows = [...logs].reverse();
    rows.forEach((r,idx)=>{
      const lab2 = r.action==='clock_in' ? '出勤' : r.action==='clock_out' ? '退勤' : r.action;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="small">${rows.length-idx}</td>
        <td><span class="badge ${r.action==='clock_in'?'in':'out'}">${lab2}</span></td>
        <td>${fmtJP(r.timestamp)}<div class="muted small">${fmtUTC(r.timestamp)}</div></td>
        <td class="small">${r.source||''}</td>
        <td class="small">${r.page?r.page.replace(/\+/g,' '):''}</td>
        <td class="small">${r.ref?`<a href="${r.ref}" target="_blank" rel="noreferrer">リンク</a>`:''}</td>
      `;
      tableBody.appendChild(tr);
    });
  }
  renderTable();

  // CSVエクスポートボタンのイベントリスナー
  document.getElementById('btnExport').addEventListener('click', ()=> exportCSV(logs));
  // ログ消去ボタンのイベントリスナー
  document.getElementById('btnClear').addEventListener('click', ()=>{
    if(confirm('ローカルの勤怠ログを全消去します。よろしいですか？')){
      logs = []; saveLogs(logs); renderTable(); latestEl.innerHTML='<span class="muted">まだ記録がありません</span>';
      statusEl.innerHTML = `<span class="stat"><span class="dot warndot"></span>ログを消去しました</span>`;
    }
  });
});
