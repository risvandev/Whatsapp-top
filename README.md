<div align="center">

<img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" width="64" alt="WhatsApp OTP logo">

# WhatsApp OTP — Passwordless Authentication

**Send one-time passcodes instantly via WhatsApp. No SMS fees, no Twilio, no paid gateway.**

[![License: MIT](https://img.shields.io/badge/License-MIT-white.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org)
[![Self-hostable](https://img.shields.io/badge/Self--hostable-yes-blue)](#running-locally)

</div>

---

## What is this?

**WhatsApp OTP** is a free, open-source, self-hostable authentication system that delivers 6-digit OTP codes directly to a user's **WhatsApp** — powered by a spare phone number you already own.

By merging the web UI frontend, database storage endpoints, and WhatsApp socket listener into a **single, self-contained Node.js Express application**, you can run the entire service under a single process and port. No Vercel configurations or complex setups required.

---

## Features

| Feature | Detail |
|---|---|
| 💬 **WhatsApp Delivery** | Sends OTPs via your own WhatsApp number using Baileys |
| 🖥️ **Live Bot Profile** | Shows the dispatcher's profile picture & name in the UI |
| 🌍 **Country Selector** | Dropdown with flag emojis + per-country number validation |
| 🔐 **Redis or Local Cache** | Upstash Redis in production; auto-falls back to local file for dev |
| 📱 **Mobile-First** | Fully responsive — works great on phone and desktop |
| 🎨 **Premium Dark UI** | Monochrome black-and-white theme, smooth micro-animations |
| 🔁 **Anti-Spam Rotation** | Randomised OTP message templates to avoid WhatsApp detection |
| ⏱️ **5-Minute TTL** | OTP expires automatically; resend cooldown of 30 seconds |
| 🚀 **One-Command Run** | `npm run dev` starts the entire app (UI + APIs + WhatsApp socket) |

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Configuration](#configuration)
   - [Step 1 — Clone and install](#step-1--clone-and-install)
   - [Step 2 — Configure environment](#step-2--configure-environment)
4. [Running Locally](#running-locally)
5. [Deploying to Production](#deploying-to-production)
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
- *(For production)* A free [Upstash](https://upstash.com) account (for Redis storage).

---

## Project Structure

```
whatsapp-otp/
├── server.js              # Express app hosting all APIs and WhatsApp socket
├── index.html             # Main authentication UI (served by server.js)
├── style.css              # Custom styling (monochrome dark theme)
├── script.js              # Client validation, polling, and verification
├── package.json           # Scripts and dependencies
├── .env.example           # Template for configuration settings
├── .env                   # Local configuration (created by you, gitignored)
├── CONTRIBUTING.md        # Contribution guidelines
├── LICENSE                # MIT License
└── README.md              # Project documentation
```

---

## Configuration

This project requires only a **single `.env` configuration file** at the root level.

> **Important:** `.env` files are **never** committed to git (they are listed in `.gitignore`). You create them yourself by copying the provided `.env.example` template.

---

### Step 1 — Clone and install

```bash
git clone https://github.com/your-username/whatsapp-otp.git
cd whatsapp-otp

# Install dependencies
npm install
```

---

### Step 2 — Configure environment

**Create the `.env` file by copying the example:**

```bash
# On Linux / macOS
cp .env.example .env

# On Windows (PowerShell)
Copy-Item .env.example .env
```

Now open `.env` and set your values. Here is the template (same as `.env.example`):

```ini
# The port the unified Express server will listen on (defaults to 3000)
PORT=3000

# ==============================================================================
# UPSTASH REDIS CONFIGURATION (OPTIONAL for local development)
# ==============================================================================
# For LOCAL development:
#   Leave these commented out. The application will automatically fall back to
#   a local JSON cache file (.otp-cache.json) to store pending OTPs.
#
# For PRODUCTION deployments (Render, Railway, Fly.io):
#   Production servers are stateless. You must configure a cloud Redis cache
#   to persist OTP codes securely. Get these from https://console.upstash.com
#
# UPSTASH_REDIS_REST_URL="https://your-db-name.upstash.io"
# UPSTASH_REDIS_REST_TOKEN="your_upstash_token_here"
```

---

## Running Locally

To start the unified server, run:

```bash
npm run dev
```

This boots the Express server on `http://localhost:3000`.

**First-time setup — Link your WhatsApp number:**

1. Open `http://localhost:3000` in your browser.
2. A QR code overlay will appear on the screen.
3. On your phone: Open **WhatsApp → Settings → Linked Devices → Link a Device**.
4. Scan the QR code displayed on your screen or printed in your terminal.
5. Once scanned, the overlay disappears and your profile picture/name will load into the status bar.

> 🔁 The session is saved in `auth_info_baileys/` at the root level. On subsequent starts, the server reconnects automatically without requiring you to scan again.

---

## Deploying to Production

Because this project runs as a standard Node.js Express server on a single port, you can deploy it in one click to any persistent node host:

### Option A: Railway (Recommended)
1. Link your GitHub repository to Railway.
2. Create a new service from the repository.
3. Set your environment variables in the settings tab (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).
4. **Important**: Add a **Persistent Volume** mounted at `/app/auth_info_baileys` to keep your WhatsApp connection active between builds/restarts.

### Option B: Render
1. Create a new **Web Service** on Render and connect your Git repository.
2. Choose the `Node` runtime and set the start command to `npm start`.
3. Add your environment variables in the dashboard.
4. **Important**: Add a **Persistent Disk** mounted at `/opt/render/project/src/auth_info_baileys` (or equivalent path) to persist the WhatsApp pairing state.

---

## Integrating into Your Own Website

Want to add WhatsApp OTP verification to your existing site? You can call the API endpoints directly from any frontend or backend.

```
Your site's form → POST /api/send-otp → WhatsApp message sent to user
User enters OTP  → POST /api/verify-otp → ✅ Verified / ❌ Rejected
```

### Step 1 — Send an OTP

Make a `POST` request to `/api/send-otp`:

```js
const response = await fetch('https://your-deployed-app.com/api/send-otp', {
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

---

### Step 2 — Verify the OTP

Once the user enters the code they received, verify it:

```js
const response = await fetch('https://your-deployed-app.com/api/verify-otp', {
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

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/send-otp` | POST | Generate and send an OTP via WhatsApp |
| `POST /api/verify-otp` | POST | Verify a submitted OTP code |
| `GET /api/profile-pic` | GET | Get a WhatsApp user's profile picture URL (uses query param `?mobile=NUMBER`) |
| `GET /api/bot-status` | GET | Check WhatsApp bot connection status + QR |

---

## Environment Variables Reference

| Variable | Description | Example / Format |
|---|---|---|
| `PORT` | Local port for Express (defaults to 3000) | `3000` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST database URL | `https://your-db-name.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | `your_upstash_token_here` |

---

## Supported Countries

The built-in UI supports validation for:

🇮🇳 India · 🇺🇸 United States · 🇬🇧 United Kingdom · 🇦🇪 UAE · 🇸🇦 Saudi Arabia · 🇶🇦 Qatar · 🇨🇦 Canada · 🇦🇺 Australia · 🇩🇪 Germany

To add/edit countries, modify the `COUNTRIES` array in [`script.js`](script.js).

---

## Security Notes

- **OTP auto-deletes** — After successful verification, the OTP is deleted from the cache immediately (prevents replay attacks).
- **5-minute TTL** — OTPs expire automatically even if never verified.
- **Session files** — `auth_info_baileys/` contains your WhatsApp session tokens. These are in `.gitignore` and must never be committed.
- **`.env` files are gitignored** — Only `.env.example` is committed. Never commit `.env`.

---

## FAQ

**Q: Is this against WhatsApp's Terms of Service?**  
A: Using WhatsApp through the unofficial Baileys library is against WhatsApp's ToS. Your number could be banned. Use a dedicated spare number — not your primary one.

**Q: My profile picture isn't showing.**  
A: WhatsApp privacy settings may block picture access for non-contacts. The UI gracefully shows your name initial instead.

**Q: Can the sender and receiver be the same number?**  
A: Yes — useful for testing. The bot can send a code to itself.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.

---

<div align="center">

Made with ❤️ — Built on [Baileys](https://github.com/WhiskeySockets/Baileys) · Caches via [Upstash](https://upstash.com)

</div>
