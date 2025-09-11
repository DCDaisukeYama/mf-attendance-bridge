// secrets-loader.js
// secrets.pemファイルを読み込むためのヘルパー関数

/**
 * secrets.pemファイルからトークンやAPIキーを読み込む
 * @returns {Object} 読み込んだ秘密情報
 */
async function loadSecrets() {
  try {
    // Chrome拡張機能内でfetchを使ってsecrets.pemを読み込み
    const response = await fetch(chrome.runtime.getURL('secrets.pem'));
    
    if (!response.ok) {
      console.warn('secrets.pem が見つかりません。デフォルト値を使用します。');
      return getDefaultSecrets();
    }
    
    const content = await response.text();
    const secrets = parseSecretsFile(content);
    
    return secrets;
  } catch (error) {
    console.warn('secrets.pemの読み込みに失敗しました:', error);
    console.warn('デフォルト値を使用します。');
    return getDefaultSecrets();
  }
}

/**
 * secrets.pemファイルの内容をパースする
 * @param {string} content ファイルの内容
 * @returns {Object} パースされた秘密情報
 */
function parseSecretsFile(content) {
  const secrets = {};
  
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // コメント行やからの行をスキップ
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    // KEY=VALUE 形式をパース
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }
    
    const key = trimmed.substring(0, equalIndex).trim();
    const value = trimmed.substring(equalIndex + 1).trim();
    
    secrets[key] = value;
  }
  
  return secrets;
}

/**
 * デフォルトの秘密情報を返す（secrets.pemが見つからない場合）
 * @returns {Object} デフォルト値
 */
function getDefaultSecrets() {
  return {
    // SHEET_TOKENは不要 - WebアプリURLから自動抽出
    TEST_API_KEY: '',
    GITHUB_TOKEN: ''
  };
}

// Chrome拡張機能のmanifest.jsonで読み込まれる場合に備えてグローバルに公開
if (typeof window !== 'undefined') {
  window.loadSecrets = loadSecrets;
}