# Contributing to WhatsApp OTP

Thank you for considering contributing! This project is open-source and welcomes all improvements.

## How to contribute

### Reporting bugs
Open an [issue](https://github.com/your-username/whatsapp-otp/issues) with:
- A clear title describing the problem
- Steps to reproduce
- What you expected vs what actually happened
- Your Node.js version and OS

### Suggesting features
Open an [issue](https://github.com/your-username/whatsapp-otp/issues) with the `enhancement` label. Describe the use case clearly.

### Submitting code changes

1. **Fork** the repository and clone your fork:
   ```bash
   git clone https://github.com/your-fork/whatsapp-otp.git
   cd whatsapp-otp
   ```

2. **Create a branch** with a descriptive name:
   ```bash
   git checkout -b fix/qr-code-timeout
   # or
   git checkout -b feat/add-telegram-bot
   ```

3. **Install dependencies** and test your change locally:
   ```bash
   npm install && cd whatsapp-bot && npm install && cd ..
   cp .env.example .env   # fill in your values
   npm run dev
   ```

4. **Commit** following [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add Telegram fallback delivery
   fix: prevent QR overlay from flickering on reconnect
   docs: add Railway deployment guide
   ```

5. **Push** your branch and open a **Pull Request** against `main`.

## Adding a new country

Edit the `COUNTRIES` array in [`script.js`](script.js):

```js
{ 
  code: 'SG',          // ISO 3166-1 alpha-2
  name: 'Singapore', 
  dialCode: '+65', 
  flag: '🇸🇬', 
  minLength: 8, 
  maxLength: 8, 
  placeholder: '91234567', 
  pattern: /^[689]\d{7}$/ 
}
```

Validate the regex against real numbers from that country before submitting.

## Code style

- Vanilla JS, no build tools required
- Use `const`/`let`, never `var`
- Keep functions small and focused
- Add comments for non-obvious logic

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
