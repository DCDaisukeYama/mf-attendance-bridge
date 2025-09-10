import http from 'http';
import { URL } from 'url';

// 受信したリクエストを保存
const receivedRequests = [];

// CORSヘッダーを設定
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// リクエストハンドラー
function requestHandler(req, res) {
  setCORSHeaders(res);
  
  // OPTIONSリクエスト（プリフライト）への対応
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost`);
  const path = parsedUrl.pathname;
  const method = req.method;

  console.log(`[${new Date().toISOString()}] ${method} ${path}`);

  // テスト用エンドポイント
  if (path === '/api/test-attendance' && method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const requestData = JSON.parse(body);
        const timestamp = new Date().toISOString();
        
        // リクエスト情報を保存
        const requestInfo = {
          timestamp,
          method,
          path,
          headers: req.headers,
          body: requestData
        };
        receivedRequests.push(requestInfo);
        
        // コンソールに詳細を出力
        console.log('=== 直接POST受信 ===');
        console.log('時刻:', timestamp);
        console.log('Authorization:', req.headers.authorization || '(なし)');
        console.log('Content-Type:', req.headers['content-type'] || '(なし)');
        console.log('データ:', JSON.stringify(requestData, null, 2));
        console.log('===================');
        
        // 成功レスポンス
        const response = {
          ok: true,
          message: 'POST受信成功',
          timestamp,
          received: requestData,
          requestCount: receivedRequests.length
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response, null, 2));
        
      } catch (error) {
        console.error('JSON Parse Error:', error);
        
        const errorResponse = {
          ok: false,
          error: 'Invalid JSON',
          message: error.message
        };

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorResponse));
      }
    });

    return;
  }

  // 受信ログを取得するエンドポイント
  if (path === '/api/received-logs' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      count: receivedRequests.length,
      requests: receivedRequests.slice(-10) // 最新10件
    }, null, 2));
    return;
  }

  // ログをクリアするエンドポイント
  if (path === '/api/clear-logs' && method === 'POST') {
    receivedRequests.length = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, message: 'ログをクリアしました' }));
    return;
  }

  // ヘルスチェック
  if (path === '/api/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      message: 'テストサーバー稼働中',
      uptime: process.uptime(),
      receivedCount: receivedRequests.length
    }));
    return;
  }

  // その他のパス
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: false,
    error: 'Not Found',
    path,
    method,
    availableEndpoints: [
      'POST /api/test-attendance',
      'GET /api/received-logs', 
      'POST /api/clear-logs',
      'GET /api/health'
    ]
  }));
}

// 利用可能なポートを探してサーバー起動
function startServer(startPort = 3000, maxPort = 3010) {
  const server = http.createServer(requestHandler);
  
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (startPort < maxPort) {
        console.log(`ポート ${startPort} は使用中です。次のポート ${startPort + 1} を試します...`);
        startServer(startPort + 1, maxPort);
      } else {
        console.error(`ポート ${startPort} から ${maxPort} まですべて使用中です。`);
        process.exit(1);
      }
    } else {
      console.error('サーバーエラー:', err);
      process.exit(1);
    }
  });

  server.listen(startPort, 'localhost', () => {
    const actualPort = server.address().port;
    console.log('=== 直接POST機能テストサーバー ===');
    console.log(`サーバー起動: http://localhost:${actualPort}`);
    console.log('');
    console.log('利用可能なエンドポイント:');
    console.log(`  POST http://localhost:${actualPort}/api/test-attendance`);
    console.log(`  GET  http://localhost:${actualPort}/api/received-logs`);
    console.log(`  POST http://localhost:${actualPort}/api/clear-logs`);
    console.log(`  GET  http://localhost:${actualPort}/api/health`);
    console.log('');
    console.log('拡張機能の設定:');
    console.log('  - 直接POSTを有効化: ✓');
    console.log(`  - POST 先 API URL: http://localhost:${actualPort}/api/test-attendance`);
    console.log('  - API キー: test-api-key-12345 (任意)');
    console.log('');
    console.log('Ctrl+C で終了');
    console.log('================================');
    
    // グローバルサーバーインスタンスとして保存（終了処理用）
    globalThis.testServer = server;
  });
}

// サーバー開始
startServer();

// 終了処理
process.on('SIGINT', () => {
  console.log('\n=== サーバー終了 ===');
  console.log(`受信したリクエスト数: ${receivedRequests.length}`);
  if (receivedRequests.length > 0) {
    console.log('最後の受信:', receivedRequests[receivedRequests.length - 1].timestamp);
  }
  console.log('サーバーを停止しました');
  process.exit(0);
});