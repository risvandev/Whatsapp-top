import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';

const BOT_URL = process.env.WHATSAPP_BOT_URL;
const BOT_SECRET = process.env.WHATSAPP_BOT_SECRET || 'nexus-default-bot-secret-key-2026';

// Support both standard Upstash variables and legacy white-labeled Vercel KV variables
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const isRedisConfigured = redisUrl && !redisUrl.includes('...') && redisToken && !redisToken.includes('...');

// Stable, lightweight HTTP/HTTPS query client to execute Upstash Redis REST commands
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
          'Connection': 'close' // Prevents keep-alive, avoiding Windows worker thread crashes
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
              resolve(parsed.result); // Upstash returns { result: ... }
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

// Stable HTTP/HTTPS webhook request helper immune to Node's Windows fetch/undici bugs
function sendWebhook(url, data, secret) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const postData = JSON.stringify(data);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'x-bot-secret': secret,
          'Connection': 'close',                  // Forces the socket to close immediately after response
          'bypass-tunnel-reminder': 'true',     // Bypass Localtunnel warning page
          'ngrok-skip-browser-warning': 'true'   // Bypass Ngrok warning page
        }
      };

      const req = client.request(options, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: body
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.setTimeout(8000, () => {
        req.destroy(new Error('Connection timeout'));
      });

      req.write(postData);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

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

    if (isRedisConfigured) {
      try {
        await queryRedis(["SET", kvKey, otp, "EX", 300]);
        console.log(`[Upstash Redis] Cached OTP for ${cleanedMobile}`);
      } catch (redisError) {
        console.error('Upstash Redis Storage Error:', redisError);
      }
    } else {
      // Local development fallback: store in a temporary workspace JSON file
      const cachePath = path.join(process.cwd(), '.otp-cache.json');
      let cache = {};
      
      if (fs.existsSync(cachePath)) {
        try {
          cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        } catch (e) {
          cache = {};
        }
      }
      
      cache[kvKey] = {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
      };
      
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      console.log(`[Dev Cache] Cached OTP ${otp} locally in .otp-cache.json`);
    }

    if (BOT_URL) {
      try {
        const botResponse = await sendWebhook(`${BOT_URL.replace(/\/$/, '')}/send-otp`, {
          mobile: cleanedMobile,
          name,
          otp
        }, BOT_SECRET);

        let botData = {};
        try {
          botData = JSON.parse(botResponse.body);
        } catch (e) {
          console.warn('[WhatsApp Bot] Warning: Response was not valid JSON:', botResponse.body);
        }

        if (botResponse.ok && botData.success) {
          return res.status(200).json({
            success: true,
            message: 'OTP dispatched via WhatsApp successfully.',
            mobile
          });
        } else {
          console.error('WhatsApp Bot API reported failure:', botData);
          throw new Error(botData.message || 'Bot failed to deliver message');
        }
      } catch (botError) {
        console.error('Failed to communicate with WhatsApp Bot:', botError);
        return res.status(200).json({
          success: true,
          message: 'WhatsApp Bot offline. Running in Demo Toast mode.',
          otp,
          demoMode: true,
          mobile
        });
      }
    } else {
      return res.status(200).json({
        success: true,
        message: 'No WhatsApp Bot URL configured. Running in Demo Toast mode.',
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
}
