import express from 'express';
import fs from 'fs';
import dotenv from 'dotenv';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5001;
const BOT_SECRET = process.env.WHATSAPP_BOT_SECRET || 'nexus-default-bot-secret-key-2026';

let sock = null;
let connectionStatus = 'disconnected';
let latestQR = null;
let botInfo = null;

/* ==========================================================================
   Anti-Spam Dynamic Message Rotation
   ========================================================================== */
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

/* ==========================================================================
   Concurrency Queue Processor (FIFO)
   ========================================================================== */
const messageQueue = [];
let isProcessingQueue = false;

async function processQueue() {
  if (isProcessingQueue || messageQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (messageQueue.length > 0) {
    const task = messageQueue.shift();
    const { jid, text, resolve, reject } = task;
    
    try {
      // Natural typing delay (800ms) to bypass WhatsApp filters and lock concurrency sequentially
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

/* ==========================================================================
   WhatsApp Socket Initialization
   ========================================================================== */
async function connectToWhatsApp() {
  console.log('[WhatsApp Bot] Initializing WhatsApp connection...');
  
  // Stores session state locally in files so QR code doesn't need to be scanned every time
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }), // Suppress detailed socket logging
    printQRInTerminal: false,
    browser: Browsers.macOS('Desktop') // Custom user-agent helps bypass WhatsApp handshake blocks (rejection code 405)
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
        console.log('[WhatsApp Bot] Logged out from WhatsApp. Clearing session credentials and generating a new QR...');
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
      console.log('SUCCESS: WhatsApp Bot API Gateway is active & connected!');
      console.log('======================================================\n');
      connectionStatus = 'connected';
      latestQR = null;
      
      // Fetch own profile details asynchronously
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
          console.log(`[WhatsApp Bot] Connected details loaded: Name: ${botInfo.name}, Number: ${botInfo.number}`);
        } catch (err) {
          console.error('[WhatsApp Bot] Error fetching bot profile details:', err);
        }
      })();
    }
  });

  // Keep credentials updated dynamically
  sock.ev.on('creds.update', saveCreds);
}

// Start the socket connection process
connectToWhatsApp().catch(err => {
  console.error('[WhatsApp Bot] Fatal initialization error:', err);
});

/* ==========================================================================
   Express Webhook Endpoint for Sending OTPs
   ========================================================================== */
app.post('/send-otp', async (req, res) => {
  const incomingSecret = req.headers['x-bot-secret'];
  
  // Guard endpoint
  if (incomingSecret !== BOT_SECRET) {
    console.warn('[WhatsApp Bot] Blocked unauthorized access attempt.');
    return res.status(401).json({ 
      success: false, 
      message: 'Unauthorized. Invalid bot secret key.' 
    });
  }

  // Ensure WhatsApp socket is alive
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(503).json({ 
      success: false, 
      message: 'WhatsApp Bot is offline or pairing is pending.' 
    });
  }

  const { mobile, name, otp } = req.body;

  if (!mobile || !otp) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing mobile number or OTP parameters.' 
    });
  }

  try {
    // Format recipient phone number to WhatsApp JID structure
    const cleanedNumber = mobile.replace(/^\+/, '').replace(/\D/g, '');
    const jid = `${cleanedNumber}@s.whatsapp.net`;

    // Generate rotated, randomized message content
    const messageContent = generateDynamicMessage(name, otp);

    // Enqueue message execution in the background (fire-and-forget for Express)
    enqueueMessage(jid, messageContent)
      .then(() => {
        console.log(`[WhatsApp Bot] OTP successfully sent to: +${cleanedNumber}`);
      })
      .catch((err) => {
        console.error(`[WhatsApp Bot] Background delivery failed for +${cleanedNumber}:`, err.message);
      });
    
    // Respond immediately to prevent Vercel serverless Hobby plan 10s timeouts
    return res.status(200).json({ 
      success: true, 
      message: 'OTP request enqueued for WhatsApp delivery.' 
    });

  } catch (error) {
    console.error('[WhatsApp Bot] Webhook error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to queue message.', 
      error: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    whatsapp: connectionStatus 
  });
});

// Expose connection status and latest QR code string
app.get('/status', (req, res) => {
  res.json({
    status: connectionStatus,
    qr: latestQR,
    bot: botInfo
  });
});

// Diagnostic endpoint to check if a phone number is registered on WhatsApp
app.get('/check-number/:number', async (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.status(503).json({ error: 'WhatsApp bot is offline.' });
  }
  
  try {
    const cleanedNumber = req.params.number.replace(/^\+/, '').replace(/\D/g, '');
    const jid = `${cleanedNumber}@s.whatsapp.net`;
    const results = await sock.onWhatsApp(jid);
    
    return res.json({
      number: cleanedNumber,
      jid,
      existsOnWhatsApp: results.length > 0 && results[0].exists,
      details: results[0] || null
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Retrieve profile picture for any WhatsApp number
app.get('/profile-pic/:number', async (req, res) => {
  if (connectionStatus !== 'connected' || !sock) {
    return res.json({ profilePicUrl: null, error: 'WhatsApp bot is offline.' });
  }
  
  try {
    const cleanedNumber = req.params.number.replace(/^\+/, '').replace(/\D/g, '');
    const jid = `${cleanedNumber}@s.whatsapp.net`;
    let pfpUrl = null;
    try {
      pfpUrl = await sock.profilePictureUrl(jid, 'image');
    } catch (e) {
      console.log(`[WhatsApp Bot] No profile pic found for ${jid}: ${e.message}`);
    }
    return res.json({
      number: cleanedNumber,
      profilePicUrl: pfpUrl
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[WhatsApp Bot] Server is listening on http://localhost:${PORT}`);
});
