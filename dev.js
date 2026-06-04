import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';

// Load environment variables from a file
function loadEnv(filePath) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      // Skip empty lines and comments
      if (!line || line.trim().startsWith('#')) continue;
      
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        let value = parts.slice(1).join('=').trim();
        // Remove surrounding quotes if they exist
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  }
}

// Load env variables
loadEnv(path.join(process.cwd(), '.env'));
loadEnv(path.join(process.cwd(), '.env.local'));

const sendOtpHandler = (await import('./api/send-otp.js')).default;
const verifyOtpHandler = (await import('./api/verify-otp.js')).default;
const profilePicHandler = (await import('./api/profile-pic.js')).default;

console.log('======================================================');
console.log('🚀 Launching WhatsApp OTP Portal: Frontend & WhatsApp Bot');
console.log('======================================================\n');

// 1. Start Local HTTP Server for Frontend + Serverless APIs (Port 3000)
const server = http.createServer((req, res) => {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-bot-secret');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Parse path
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Route API requests
  if (pathname === '/api/bot-status') {
    const botUrl = process.env.WHATSAPP_BOT_URL || 'http://localhost:5001';
    const statusUrl = `${botUrl.replace(/\/$/, '')}/status`;
    
    try {
      const parsedBotUrl = new URL(statusUrl);
      const options = {
        hostname: parsedBotUrl.hostname,
        port: parsedBotUrl.port || 5001,
        path: parsedBotUrl.pathname,
        method: 'GET',
        headers: {
          'Connection': 'close'
        }
      };

      const statusReq = http.request(options, (statusRes) => {
        let body = '';
        statusRes.setEncoding('utf8');
        statusRes.on('data', chunk => { body += chunk; });
        statusRes.on('end', () => {
          res.statusCode = statusRes.statusCode || 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(body);
        });
      });

      statusReq.on('error', (err) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'offline', error: err.message }));
      });

      statusReq.setTimeout(2000, () => {
        statusReq.destroy();
      });
      statusReq.end();
    } catch (e) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'offline', error: e.message }));
    }
    return;
  }

  // Route API requests
  if (pathname === '/api/send-otp' || pathname === '/api/verify-otp' || pathname === '/api/profile-pic') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch (e) {
        req.body = {};
      }

      // Parse and populate query parameters for Vercel compat
      const query = {};
      for (const [key, value] of parsedUrl.searchParams.entries()) {
        query[key] = value;
      }
      req.query = query;

      // Mock Vercel response wrapper to ensure 100% compatibility with API files
      const vercelRes = {
        statusCode: 200,
        headers: {},
        setHeader(name, value) {
          this.headers[name.toLowerCase()] = value;
          res.setHeader(name, value);
          return this;
        },
        status(code) {
          this.statusCode = code;
          res.statusCode = code;
          return this;
        },
        json(data) {
          this.setHeader('Content-Type', 'application/json');
          res.statusCode = this.statusCode;
          res.end(JSON.stringify(data));
          return this;
        },
        send(data) {
          res.statusCode = this.statusCode;
          res.end(data);
          return this;
        }
      };

      try {
        if (pathname === '/api/send-otp') {
          await sendOtpHandler(req, vercelRes);
        } else if (pathname === '/api/verify-otp') {
          await verifyOtpHandler(req, vercelRes);
        } else if (pathname === '/api/profile-pic') {
          await profilePicHandler(req, vercelRes);
        }
      } catch (err) {
        console.error(`[API Error] ${pathname}:`, err);
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, message: 'Internal Server Error' }));
        }
      }
    });
    return;
  }

  // Serve static files
  let safePath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(process.cwd(), safePath);

  // Prevent directory traversal attacks
  const relative = path.relative(process.cwd(), filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.statusCode = 200;
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Local Server] Running frontend & APIs at: http://localhost:${PORT}`);
});

// 2. Start WhatsApp Bot (Backend - Port 5001)
console.log('[Orchestrator] Starting WhatsApp Bot on Port 5001...');
const backend = spawn('npm', ['start'], {
  cwd: path.join(process.cwd(), 'whatsapp-bot'),
  stdio: 'inherit',
  shell: true
});

// Graceful shutdown handler
const shutdown = () => {
  console.log('\n======================================================');
  console.log('👋 Stopping all servers...');
  console.log('======================================================\n');
  
  // Close HTTP server
  try { server.close(); } catch (e) {}
  
  // Kill child process
  try { backend.kill('SIGINT'); } catch (e) {}
  
  process.exit(0);
};

// Catch termination events (Ctrl + C)
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
