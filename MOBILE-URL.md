# Run Strinex on Mobile

## Quick start (same Wi‑Fi)

1. **Start the app** (from project root):
   ```bash
   npm run mobile
   ```

2. **Get your local IP** (Windows PowerShell):
   ```powershell
   ipconfig | findstr "IPv4"
   ```

3. **On your phone** (connected to the same Wi‑Fi):
   - Open: `http://YOUR_IP:3000`
   - Example: `http://10.152.168.108:3000`

---

## GPS on mobile needs HTTPS

Browsers (Chrome, Safari) require **HTTPS** for geolocation on non‑localhost origins. Plain `http://` will block GPS on your phone.

### Option A: ngrok (recommended for quick tests)

1. Start the app: `npm run mobile`
2. In another terminal:
   ```bash
   npx ngrok http 3000
   ```
3. Use the **https** URL shown by ngrok on your phone (e.g. `https://abc123.ngrok-free.app`).

### Option B: Deploy

Deploy to Vercel or Netlify and open the site on your phone via its HTTPS URL.

---

## Local URLs for reference

- Local: `http://localhost:3000`
- Same network (replace with your IP): `http://10.152.168.108:3000` or `http://192.168.x.x:3000`
