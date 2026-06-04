<div align="center">

<img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" width="64" alt="WhatsApp OTP logo">

# WhatsApp OTP — Passwordless Authentication

**Send one-time passcodes instantly via WhatsApp. No SMS fees, no Twilio, no paid gateway.**

[![License: MIT](https://img.shields.io/badge/License-MIT-white.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org)
[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-black)](https://vercel.com)
[![Self-hostable](https://img.shields.io/badge/Self--hostable-yes-blue)](#running-locally)

</div>

---

## What is this?

**WhatsApp OTP** is a free, open-source, self-hostable authentication system that delivers 6-digit OTP codes directly to a user's **WhatsApp** — powered by a spare phone number you already own.

No paid SMS gateway. No Twilio. No third-party API costs. Just your own WhatsApp number acting as the OTP dispatcher.

---

## Features

| Feature | Detail |
|---|---|
| 💬 **WhatsApp Delivery** | Sends OTPs via your own WhatsApp number using Baileys |
| 🖥️ **Live Bot Profile** | Shows the dispatcher's profile picture & number in the UI |
| 🌍 **Country Selector** | Dropdown with flag emojis + per-country number validation |
| 🔐 **Redis or Local Cache** | Upstash Redis in production; auto-falls back to local file for dev |
| 📱 **Mobile-First** | Fully responsive — works great on phone and desktop |
| 🎨 **Premium Dark UI** | Monochrome black-and-white theme, smooth micro-animations |
| 🔒 **Bot Webhook Auth** | Shared-secret header guards the `/send-otp` webhook endpoint |
| ♻️ **Anti-Spam Rotation** | Randomised OTP message templates to avoid WhatsApp detection |
| ⏱️ **5-Minute TTL** | OTP expires automatically; resend cooldown of 30 seconds |
| 🚀 **One-Command Dev** | `npm run dev` starts everything — frontend + bot simultaneously |

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Configuration](#configuration)
   - [Step 1 — Clone and install](#step-1--clone-and-install)
   - [Step 2 — Configure root .env](#step-2--configure-root-env)
   - [Step 3 — Configure bot .env](#step-3--configure-whatsapp-bot-env)
4. [Running Locally](#running-locally)
5. [Deploying to Vercel](#deploying-to-vercel)
6. [Integrating into Your Own Website](#integrating-into-your-own-website)
7. [API Reference](#api-reference)
8. [Environment Variables Reference](#environment-variables-reference)
9. [Supported Countries](#supported-countries)
10. [Security Notes](#security-notes)
11. [Contributing](#contributing)
12. [FAQ](#faq)
13. [License](#license)

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 18+** → [Download here](https://nodejs.org)
- **npm** (comes with Node.js)
- **A spare WhatsApp-registered phone number** — this will be the OTP sender. Do **not** use your primary number.
- *(For production)* A free [Vercel](https://vercel.com) account and a free [Upstash](https://upstash.com) Redis database.

---

## Project Structure

```
whatsapp-otp/
├── api/
│   ├── send-otp.js        # Serverless: generate OTP, cache it, call bot
│   ├── verify-otp.js      # Serverless: compare OTP and clear cache
│   └── profile-pic.js     # Serverless: fetch WhatsApp profile picture
├── whatsapp-bot/
│   ├── bot.js             # Express + Baileys WhatsApp gateway (port 5001)
│   ├── package.json
│   └── .env.example       # ← Template for bot environment variables
├── index.html             # Main authentication UI
├── style.css              # All styling (dark theme, animations)
├── script.js              # Client logic, validation, API calls
├── dev.js                 # Local dev orchestrator (starts both servers)
├── vercel.json            # Vercel routing config
├── .env.example           # ← Template for root environment variables
├── .env                   # ← Your actual config (gitignored, you create this)
├── AUTH_ARCHITECTURE.md   # System design documentation
├── CONTRIBUTING.md
└── LICENSE
```

---

## Configuration

This project uses **two separate `.env` files** — one for the root API server and one for the WhatsApp Bot.

> **Important:** `.env` files are **never** committed to git (they're in `.gitignore`). You create them yourself by copying the provided `.env.example` templates.

---

### Step 1 — Clone and install

```bash
git clone https://github.com/your-username/whatsapp-otp.git
cd whatsapp-otp

# Install root dependencies
npm install

# Install WhatsApp bot dependencies
cd whatsapp-bot && npm install && cd ..
```

---

### Step 2 — Configure root `.env`

The root `.env` controls the **API server** (the Vercel serverless functions and local dev server).

**Create the file by copying the example:**

```bash
# On Linux / macOS
cp .env.example .env

# On Windows (PowerShell)
Copy-Item .env.example .env
```

Now open `.env` and fill in your values. Here is the full template (same as `.env.example`) with explanations:

```ini
# ==============================================================================
# LOCAL DEVELOPMENT CONFIGURATION (Required)
# ==============================================================================

# The URL where your WhatsApp Bot is running.
# For local development this is always http://localhost:5001
# For production (Vercel) set this to your deployed bot's public URL
WHATSAPP_BOT_URL="http://localhost:5001"

# A secret key shared between the API and the WhatsApp Bot.
# This prevents anyone from triggering your bot without permission.
# ⚠️  CHANGE THIS to any long random string before deploying!
WHATSAPP_BOT_SECRET="change-this-to-a-long-random-secret"


# ==============================================================================
# VERCEL / PRODUCTION DEPLOYMENT ONLY (Not needed for local development)
# ==============================================================================
# Upstash Redis credentials are only required when deploying to Vercel.
# Locally, the system automatically uses a local file cache (.otp-cache.json).
#
# Get these values from: https://console.upstash.com → your Redis database → REST API
#
# KV_REST_API_URL="https://YOUR-DATABASE-ID.upstash.io"
# KV_REST_API_TOKEN="YOUR_UPSTASH_REST_TOKEN"
```

> 💡 **For local development** you only need `WHATSAPP_BOT_URL` and `WHATSAPP_BOT_SECRET`. Leave the Redis lines commented out — the system will automatically save OTPs to a local file.

---

### Step 3 — Configure WhatsApp bot `.env`

The WhatsApp bot has its **own** separate `.env` inside the `whatsapp-bot/` folder.

```bash
# On Linux / macOS
cp whatsapp-bot/.env.example whatsapp-bot/.env

# On Windows (PowerShell)
Copy-Item whatsapp-bot\.env.example whatsapp-bot\.env
```

Open `whatsapp-bot/.env` and set your values:

```ini
# Port the bot server listens on (default: 5001)
PORT=5001

# Must match WHATSAPP_BOT_SECRET in the root .env exactly!
WHATSAPP_BOT_SECRET="change-this-to-a-long-random-secret"
```

> ⚠️ **Both `WHATSAPP_BOT_SECRET` values must be identical** — the root `.env` and the `whatsapp-bot/.env`. If they don't match, the API will be rejected by the bot.

---

## Running Locally

Once both `.env` files are configured, start everything with a single command from the project root:

```bash
npm run dev
```

This starts:
- ✅ **Frontend + API server** on `http://localhost:3000`
- ✅ **WhatsApp Bot** on `http://localhost:5001`

**First-time setup — Link your WhatsApp number:**

1. Open `http://localhost:3000` in your browser
2. A QR code overlay will appear automatically
3. On your phone: **WhatsApp → Settings → Linked Devices → Link a Device**
4. Scan the QR code
5. The overlay disappears and your profile picture appears — you're connected!

> 🔁 The session is saved in `whatsapp-bot/auth_info_baileys/`. On subsequent starts, the bot reconnects automatically without needing to scan again.

**Test it:**
1. Select your country from the dropdown
2. Enter your phone number
3. Click **Send OTP**
4. Check WhatsApp on that number — the code arrives within seconds

---

## Deploying to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial release"
git remote add origin https://github.com/your-username/whatsapp-otp.git
git push -u origin main
```

### 2. Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Leave all settings as default — Vercel auto-detects the project
4. Click **Deploy**

### 3. Set up Upstash Redis

1. In your Vercel project, go to the **Storage** tab
2. Click **Create Database → Upstash Redis**
3. Vercel automatically injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` into your environment

### 4. Deploy the WhatsApp Bot permanently

The bot needs to run **24/7** on a persistent server. Recommended free options:

| Platform | Free Tier | Notes |
|---|---|---|
| **[Render](https://render.com)** | Yes (sleeps after 15 min inactivity) | Good for low-traffic projects |
| **[Railway](https://railway.app)** | $5/month | Always-on, easiest setup |
| **[Fly.io](https://fly.io)** | Generous free allowance | Docker-based, most control |
| **Your own VPS** | Varies | Full control, cheapest long-term |

After deploying, check your platform's build logs — the QR code will appear there. Scan it once to link the bot. The session persists across restarts.

### 5. Add environment variables to Vercel

Go to your Vercel project → **Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `WHATSAPP_BOT_URL` | Your bot's public URL, e.g. `https://my-bot.onrender.com` |
| `WHATSAPP_BOT_SECRET` | Your secret key (must match the bot's value) |

### 6. Redeploy

Trigger a new deployment. Your app is live! 🎉

---

## Integrating into Your Own Website

Want to add WhatsApp OTP verification to your existing site? You can call the API endpoints directly from any frontend or backend.

### How it works

```
Your site's form → POST /api/send-otp → WhatsApp message sent to user
User enters OTP  → POST /api/verify-otp → ✅ Verified / ❌ Rejected
```

---

### Step 1 — Send an OTP

Make a `POST` request to `/api/send-otp`:

```js
// Example: plain JavaScript fetch
const response = await fetch('https://your-deployed-app.vercel.app/api/send-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'John Doe',         // User's name (used in the WhatsApp message greeting)
    mobile: '+919876543210'   // Full international number with country code
  })
});

const data = await response.json();
// { success: true, message: "OTP dispatched via WhatsApp successfully." }
```

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | User's display name (shown in the OTP message) |
| `mobile` | string | ✅ | Phone number in international format, e.g. `+919876543210` |

**Success response (`200`):**

```json
{
  "success": true,
  "message": "OTP dispatched via WhatsApp successfully.",
  "mobile": "+919876543210"
}
```

**Error response (`400`):**

```json
{
  "success": false,
  "message": "Name and mobile number are required."
}
```

---

### Step 2 — Verify the OTP

Once the user enters the code they received, verify it:

```js
const response = await fetch('https://your-deployed-app.vercel.app/api/verify-otp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mobile: '+919876543210',  // Same number used in send-otp
    otp: '482931'             // The 6-digit code the user entered
  })
});

const data = await response.json();

if (data.success) {
  // ✅ OTP is correct — log the user in, redirect, etc.
} else {
  // ❌ Wrong OTP or expired — show error
  console.error(data.message);
}
```

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `mobile` | string | ✅ | Same number used in the send step |
| `otp` | string | ✅ | The 6-digit code entered by the user |

**Success response (`200`):**

```json
{
  "success": true,
  "message": "OTP verified successfully."
}
```

**Failure response (`400`):**

```json
{
  "success": false,
  "message": "The OTP code is incorrect. Please try again."
}
```

```json
{
  "success": false,
  "message": "The OTP code has expired or is invalid. Please request a new one."
}
```

---

### Complete integration example (HTML + JS)

A minimal working example you can drop into any webpage:

```html
<!-- Step 1: Phone number form -->
<form id="sendForm">
  <input type="text" id="userName" placeholder="Your name" required>
  <input type="tel" id="userPhone" placeholder="+91 98765 43210" required>
  <button type="submit">Send OTP</button>
</form>

<!-- Step 2: OTP entry form (hidden initially) -->
<form id="verifyForm" style="display:none">
  <input type="text" id="otpInput" placeholder="Enter 6-digit code" maxlength="6" required>
  <button type="submit">Verify</button>
</form>

<p id="statusMsg"></p>

<script>
  const API_BASE = 'https://your-deployed-app.vercel.app'; // ← change this
  let phoneNumber = '';

  document.getElementById('sendForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    phoneNumber = document.getElementById('userPhone').value;
    const name = document.getElementById('userName').value;

    const res = await fetch(`${API_BASE}/api/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mobile: phoneNumber })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('sendForm').style.display = 'none';
      document.getElementById('verifyForm').style.display = 'block';
      document.getElementById('statusMsg').textContent = '✅ OTP sent to your WhatsApp!';
    } else {
      document.getElementById('statusMsg').textContent = '❌ ' + data.message;
    }
  });

  document.getElementById('verifyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = document.getElementById('otpInput').value;

    const res = await fetch(`${API_BASE}/api/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: phoneNumber, otp })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('statusMsg').textContent = '🎉 Verified! Logging you in...';
      // → Your login logic here (set cookie, redirect, etc.)
    } else {
      document.getElementById('statusMsg').textContent = '❌ ' + data.message;
    }
  });
</script>
```

> 💡 **CORS note:** If your site is on a different domain, you may need to add your domain to the CORS allowed origins in `dev.js` (locally) and Vercel's headers config in `vercel.json`.

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/send-otp` | POST | Generate and send an OTP via WhatsApp |
| `POST /api/verify-otp` | POST | Verify a submitted OTP code |
| `GET /api/profile-pic?mobile=NUMBER` | GET | Get a WhatsApp user's profile picture URL |
| `GET /api/bot-status` | GET | Check WhatsApp bot connection status + QR |

---

## Environment Variables Reference

### Root `.env`

```ini
# Required always
WHATSAPP_BOT_URL="http://localhost:5001"         # URL of your WhatsApp Bot
WHATSAPP_BOT_SECRET="your-secret-key-here"       # Shared auth secret

# Required only for Vercel/production (get from Upstash dashboard)
KV_REST_API_URL="https://YOUR-DB.upstash.io"
KV_REST_API_TOKEN="YOUR_TOKEN"
```

### `whatsapp-bot/.env`

```ini
PORT=5001                                         # Bot server port
WHATSAPP_BOT_SECRET="your-secret-key-here"       # Must match root .env!
```

---

## Supported Countries

The built-in UI supports validation for:

🇮🇳 India · 🇺🇸 United States · 🇬🇧 United Kingdom · 🇦🇪 UAE · 🇸🇦 Saudi Arabia · 🇶🇦 Qatar · 🇨🇦 Canada · 🇦🇺 Australia · 🇩🇪 Germany

**To add a country**, edit the `COUNTRIES` array in [`script.js`](script.js):

```js
{ 
  code: 'SG',           // ISO 3166-1 alpha-2 country code
  name: 'Singapore', 
  dialCode: '+65', 
  flag: '🇸🇬', 
  minLength: 8, 
  maxLength: 8, 
  placeholder: '91234567',          // Example number shown in input
  pattern: /^[689]\d{7}$/           // Regex to validate local numbers
}
```

---

## Security Notes

- **Change the default secret** — `WHATSAPP_BOT_SECRET` defaults to a placeholder. Always set your own long random value before deploying.
- **OTP auto-deletes** — After successful verification, the OTP is deleted from the cache immediately (no replay attacks).
- **5-minute TTL** — OTPs expire automatically even if never verified.
- **Session files** — `auth_info_baileys/` contains your WhatsApp session tokens. These are in `.gitignore` and must never be committed.
- **`.env` files are gitignored** — Only `.env.example` is committed. Never commit `.env`.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to report bugs, add countries, or submit Pull Requests.

---

## FAQ

**Q: Is this against WhatsApp's Terms of Service?**  
A: Using WhatsApp through the unofficial Baileys library is against WhatsApp's ToS. Your number could be banned. Use a dedicated spare number — not your personal one.

**Q: The QR code isn't appearing.**  
A: Make sure the WhatsApp bot started correctly (`npm run dev` should show `[WhatsApp Bot] Server is listening on port 5001`). The QR overlay polls automatically every 2 seconds.

**Q: My profile picture isn't showing.**  
A: WhatsApp privacy settings may block picture access for non-contacts. The UI gracefully shows your name initial instead.

**Q: Can the sender and receiver be the same number?**  
A: Yes — useful for testing. The bot can send a code to itself.

**Q: How do I integrate this with my backend (Node.js / Python / PHP)?**  
A: See the [Integrating into Your Own Website](#integrating-into-your-own-website) section. The API is plain HTTP — any language can call it.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.

---

<div align="center">

Made with ❤️ — Built on [Baileys](https://github.com/WhiskeySockets/Baileys) · Deployable on [Vercel](https://vercel.com) · Caches via [Upstash](https://upstash.com)

</div>
