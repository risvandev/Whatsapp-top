import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

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
      // Local development fallback: read from temporary workspace JSON file
      const cachePath = path.join(process.cwd(), '.otp-cache.json');
      if (fs.existsSync(cachePath)) {
        try {
          const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
          const cachedRecord = cache[kvKey];
          
          if (cachedRecord) {
            if (Date.now() < cachedRecord.expiresAt) {
              cachedOtp = cachedRecord.otp;
            } else {
              console.log(`[Dev Cache] Key ${kvKey} has expired.`);
            }
          }
        } catch (e) {
          console.error('Failed to read local dev cache file:', e);
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
        const cachePath = path.join(process.cwd(), '.otp-cache.json');
        if (fs.existsSync(cachePath)) {
          try {
            const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            delete cache[kvKey];
            fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
            console.log(`[Dev Cache] Removed key ${kvKey} from local file cache.`);
          } catch (e) {
            console.error('Failed to write local dev cache file:', e);
          }
        }
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
}
