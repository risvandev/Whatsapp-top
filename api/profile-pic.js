import http from 'http';
import https from 'https';

const BOT_URL = process.env.WHATSAPP_BOT_URL;

// Helper to send query to WhatsApp Bot backend
function fetchBotProfilePic(url) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Connection': 'close',
          'bypass-tunnel-reminder': 'true',
          'ngrok-skip-browser-warning': 'true'
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

      req.setTimeout(5000, () => {
        req.destroy(new Error('Bot timeout'));
      });

      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

export default async function handler(req, res) {
  // Support both GET and POST for maximum versatility
  const method = req.method;
  let mobile = '';
  
  if (method === 'GET') {
    const { query } = req;
    mobile = query?.mobile || '';
  } else if (method === 'POST') {
    mobile = req.body?.mobile || '';
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  if (!mobile) {
    return res.status(400).json({ 
      success: false, 
      message: 'Mobile number is required.' 
    });
  }

  const cleanedMobile = mobile.replace(/[\s\-\(\)\+]/g, '');

  if (!BOT_URL) {
    return res.status(200).json({
      success: true,
      profilePicUrl: null,
      message: 'No WhatsApp Bot URL configured.'
    });
  }

  try {
    const botUrlBase = BOT_URL.replace(/\/$/, '');
    const botResponse = await fetchBotProfilePic(`${botUrlBase}/profile-pic/${cleanedMobile}`);
    
    let botData = {};
    try {
      botData = JSON.parse(botResponse.body);
    } catch (e) {
      console.warn('[Profile Pic API] Warning: Response was not valid JSON:', botResponse.body);
    }

    if (botResponse.ok) {
      return res.status(200).json({
        success: true,
        profilePicUrl: botData.profilePicUrl || null
      });
    } else {
      throw new Error(botData.error || 'Failed to fetch from bot');
    }
  } catch (error) {
    console.error('Failed to fetch profile picture:', error);
    // Fall back gracefully rather than returning 500
    return res.status(200).json({ 
      success: true, 
      profilePicUrl: null, 
      error: error.message 
    });
  }
}
