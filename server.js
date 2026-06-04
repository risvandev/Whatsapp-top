import express from 'express';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import dotenv from 'dotenv';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';

// Load environment variables from .env and .env.local if present
dotenv.config({ path: path.join(process.cwd(), '.env') });
if (fs.existsSync(path.join(process.cwd(), '.env.local'))) {
  const envConfig = dotenv.parse(fs.readFileSync(path.join(process.cwd(), '.env.local')));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const isRedisConfigured = redisUrl && !redisUrl.includes('...') && redisToken && !redisToken.includes('...');

/* ==========================================================================
   Upstash Redis Rest Client
   ========================================================================== */
function queryRedis(commandArray) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(redisUrl);
      const postData = JSON.stringify(commandArray);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname || '/',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Connection': 'close'
        }
      };

      const req = client.request(options, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body);
              resolve(parsed.result);
            } catch (e) {
              resolve(body);
            }
          } else {
            reject(new Error(`Upstash returned status ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.setTimeout(5000, () => {
        req.destroy(new Error('Redis timeout'));
      });

      req.write(postData);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/* ==========================================================================
   Local File Caching Fallback
   ========================================================================== */
const cachePath = path.join(process.cwd(), '.otp-cache.json');
function getLocalCache() {
  if (fs.existsSync(cachePath)) {
    try {
      return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}
function setLocalCache(cache) {
  try {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('Failed to write local dev cache file:', e);
  }
}

/* ==========================================================================
   WhatsApp Connection & State Management
   ========================================================================== */
let sock = null;
let connectionStatus = 'disconnected';
let latestQR = null;
let botInfo = null;

const GREETINGS = [
  "Hello", "Hi", "Greetings", "Welcome", "Secure access requested by", "Hey there"
];

const TEMPLATES = [
  (greet, name, otp, ref) => `🔒 *WhatsApp OTP Verification*\n\n${greet} *${name}*,\n\nYour secure verification passcode is: *${otp}*\n\nIt is valid for 5 minutes. Do not share this code with anyone.\n\n(Ref: ${ref})`,
  (greet, name, otp, ref) => `🔒 *WhatsApp OTP Code*\n\n${greet} *${name}*,\n\nPasscode *${otp}* has been generated for your secure authentication.\n\nUse it within 5 minutes. Do not share this credential. [ID: ${ref}]`,
  (greet, name, otp, ref) => `🔒 *WhatsApp OTP Authentication*\n\n${greet} *${name}*,\n\nUse *${otp}* as your temporary security code to verify your profile.\n\nNever share this code with anyone. (Session: ${ref})`
];

function generateDynamicMessage(name, otp) {
  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  const randomRef = Math.random().toString(36).substring(2, 8).toUpperCase();
  return template(greeting, name || 'User', otp, randomRef);
}

const messageQueue = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || messageQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (messageQueue.length > 0) {
    const task = messageQueue.shift();
    const { jid, text, resolve, reject } = task;
    
    try {
      await new Promise(res => setTimeout(res, 800));
      
      if (connectionStatus !== 'connected' || !sock) {
        throw new Error('WhatsApp bot is currently offline.');
      }
      
      await sock.sendMessage(jid, { text });
      console.log(`[Queue] Successfully sent WhatsApp to JID: ${jid}`);
      resolve();
    } catch (error) {
      console.error(`[Queue] Failed to deliver WhatsApp to JID ${jid}:`, error);
      reject(error);
    }
  }
  
  isProcessingQueue = false;
}

function enqueueMessage(jid, text) {
  return new Promise((resolve, reject) => {
    messageQueue.push({ jid, text, resolve, reject });
    processQueue();
  });
}

async function connectToWhatsApp() {
  console.log('[WhatsApp Bot] Initializing WhatsApp connection...');
  
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.macOS('Desktop')
  });
  
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('\n======================================================');
      console.log('ACTION REQUIRED: SCAN THE QR CODE BELOW WITH WHATSAPP');
      console.log('To link: Open WhatsApp > Settings > Linked Devices > Link a Device');
      console.log('======================================================\n');
      qrcode.generate(qr, { small: true });
      latestQR = qr;
    }
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`[WhatsApp Bot] Connection closed. Status Code: ${statusCode}. Reconnecting: ${shouldReconnect}`);
      connectionStatus = 'disconnected';
      botInfo = null;
      
      if (shouldReconnect) {
        connectToWhatsApp();
      } else {
        console.log('[WhatsApp Bot] Logged out from WhatsApp. Clearing session credentials...');
        try {
          fs.rmSync('auth_info_baileys', { recursive: true, force: true });
        } catch (err) {
          console.error('[WhatsApp Bot] Failed to clear session directory:', err);
        }
        latestQR = null;
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('\n======================================================');
      console.log('SUCCESS: WhatsApp Bot is active & connected!');
      console.log('======================================================\n');
      connectionStatus = 'connected';
      latestQR = null;
      
      (async () => {
        try {
          const botJid = sock.user.id.replace(/:.*$/, '') + '@s.whatsapp.net';
          let pfpUrl = null;
          try {
            pfpUrl = await sock.profilePictureUrl(botJid, 'image');
          } catch (pfpErr) {
            console.log('[WhatsApp Bot] Could not fetch bot profile picture:', pfpErr.message);
          }
          botInfo = {
            name: sock.user.name || 'WhatsApp Dispatcher',
            number: botJid.split('@')[0],
            profilePicUrl: pfpUrl
          };
          console.log(`[WhatsApp Bot] Connected details: Name: ${botInfo.name}, Number: ${botInfo.number}`);
        } catch (err) {
          console.error('[WhatsApp Bot] Error fetching bot profile details:', err);
        }
      })();
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// Start connection loop
connectToWhatsApp().catch(err => {
  console.error('[WhatsApp Bot] Fatal initialization error:', err);
});

/* ==========================================================================
   Express Web Application
   ========================================================================== */
const app = express();
app.use(express.json());

// Enable CORS for API routes
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-bot-secret');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Securely serve specific static frontend files (prevention of traversal/env downloads)
const serveFile = (filename) => (req, res) => {
  res.sendFile(path.join(process.cwd(), filename));
};
app.get('/', serveFile('index.html'));
app.get('/index.html', serveFile('index.html'));
app.get('/script.js', serveFile('script.js'));
app.get('/style.css', serveFile('style.css'));
app.get('/assets/logo.jpg', serveFile('assets/logo.jpg'));

// 1. Get WhatsApp connection status
app.get('/api/bot-status', (req, res) => {
  res.json({
    status: connectionStatus,
    qr: latestQR,
    bot: botInfo
  });
});

// 2. Dispatch OTP via WhatsApp
app.post('/api/send-otp', async (req, res) => {
  try {
    const { name, mobile } = req.body;

    if (!name || !mobile) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name and mobile number are required.' 
      });
    }

    const cleanedMobile = mobile.replace(/[\s\-\(\)\+]/g, '');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const kvKey = `otp:${cleanedMobile}`;

    // Cache the OTP code
    if (isRedisConfigured) {
      try {
        await queryRedis(["SET", kvKey, otp, "EX", 300]);
        console.log(`[Upstash Redis] Cached OTP for ${cleanedMobile}`);
      } catch (redisError) {
        console.error('Upstash Redis Storage Error:', redisError);
      }
    } else {
      const cache = getLocalCache();
      cache[kvKey] = {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000
      };
      setLocalCache(cache);
      console.log(`[Dev Cache] Cached OTP ${otp} locally in .otp-cache.json`);
    }

    // Try to send via WhatsApp bot
    if (connectionStatus === 'connected' && sock) {
      try {
        const jid = `${cleanedMobile}@s.whatsapp.net`;
        const messageContent = generateDynamicMessage(name, otp);

        // Enqueue message execution in the background
        enqueueMessage(jid, messageContent)
          .then(() => {
            console.log(`[WhatsApp Bot] OTP successfully sent to: +${cleanedMobile}`);
          })
          .catch((err) => {
            console.error(`[WhatsApp Bot] Background delivery failed for +${cleanedMobile}:`, err.message);
          });

        return res.status(200).json({
          success: true,
          message: 'OTP dispatched via WhatsApp successfully.',
          mobile
        });
      } catch (botError) {
        console.error('Failed to communicate with WhatsApp Bot:', botError);
        return res.status(200).json({
          success: true,
          message: 'WhatsApp Bot error. Running in Demo Toast mode.',
          otp,
          demoMode: true,
          mobile
        });
      }
    } else {
      return res.status(200).json({
        success: true,
        message: 'WhatsApp Bot offline. Running in Demo Toast mode.',
        otp,
        demoMode: true,
        mobile
      });
    }
  } catch (error) {
    console.error('Send OTP Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal Server Error. Please try again.' 
    });
  }
});

// 3. Verify OTP
app.post('/api/verify-otp', async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Mobile number and OTP are required fields.' 
      });
    }

    const cleanedMobile = mobile.replace(/[\s\-\(\)\+]/g, '');
    const kvKey = `otp:${cleanedMobile}`;
    let cachedOtp = null;

    if (isRedisConfigured) {
      try {
        cachedOtp = await queryRedis(["GET", kvKey]);
      } catch (redisError) {
        console.error('Upstash Redis Read Error:', redisError);
        return res.status(500).json({ 
          success: false, 
          message: 'Authentication service temporarily unavailable.' 
        });
      }
    } else {
      const cache = getLocalCache();
      const cachedRecord = cache[kvKey];
      
      if (cachedRecord) {
        if (Date.now() < cachedRecord.expiresAt) {
          cachedOtp = cachedRecord.otp;
        } else {
          console.log(`[Dev Cache] Key ${kvKey} has expired.`);
        }
      }
    }

    if (!cachedOtp) {
      return res.status(400).json({ 
        success: false, 
        message: 'The OTP code has expired or is invalid. Please request a new one.' 
      });
    }

    if (cachedOtp.trim() === otp.trim()) {
      // Clear OTP on successful verification
      if (isRedisConfigured) {
        try {
          await queryRedis(["DEL", kvKey]);
        } catch (delError) {
          console.error('Failed to delete Redis key:', delError);
        }
      } else {
        const cache = getLocalCache();
        delete cache[kvKey];
        setLocalCache(cache);
        console.log(`[Dev Cache] Removed key ${kvKey} from local file cache.`);
      }

      return res.status(200).json({
        success: true,
        message: 'OTP verified successfully.'
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'The OTP code is incorrect. Please try again.' 
      });
    }
  } catch (error) {
    console.error('Verify OTP Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal Server Error. Please try again.' 
    });
  }
});

// 4. Retrieve Profile Picture (GET/POST support)
const handleProfilePic = async (req, res) => {
  let mobile = '';
  if (req.method === 'GET') {
    mobile = req.query?.mobile || '';
  } else {
    mobile = req.body?.mobile || '';
  }

  if (!mobile) {
    return res.status(400).json({ 
      success: false, 
      message: 'Mobile number is required.' 
    });
  }

  const cleanedMobile = mobile.replace(/[\s\-\(\)\+]/g, '');

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(200).json({
      success: true,
      profilePicUrl: null,
      message: 'WhatsApp Bot is offline.'
    });
  }

  try {
    const jid = `${cleanedMobile}@s.whatsapp.net`;
    let pfpUrl = null;
    try {
      pfpUrl = await sock.profilePictureUrl(jid, 'image');
    } catch (e) {
      console.log(`[WhatsApp Bot] No profile pic found for ${jid}: ${e.message}`);
    }
    return res.status(200).json({
      success: true,
      profilePicUrl: pfpUrl
    });
  } catch (error) {
    console.error('Failed to fetch profile picture:', error);
    return res.status(200).json({ 
      success: true, 
      profilePicUrl: null, 
      error: error.message 
    });
  }
};
app.get('/api/profile-pic', handleProfilePic);
app.post('/api/profile-pic', handleProfilePic);

// Fallback 404
app.use((req, res) => {
  res.status(404).send('Not Found');
});

// Start the unified server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Unified Server] Running on http://localhost:${PORT}`);
});
