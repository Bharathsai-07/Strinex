# Strinex Deployment Guide

## Prerequisites
1. **GitHub Repository**: Push your code to GitHub.
2. **MongoDB Atlas**: Set up a free MongoDB cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
3. **Clerk Account**: Get production keys from [clerk.com](https://clerk.com).
4. **Gemini API Key**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey).
5. **Render Account**: Sign up at [render.com](https://render.com).

## Environment Variables
Create `.env` file in backend/:
```
MONGODB_URI=mongodb+srv://...
GEMINI_API_KEY=...
CLERK_SECRET_KEY=sk_live_...
CORS_ORIGINS=https://your-frontend.onrender.com,https://your-backend.onrender.com
PORT=5000
```

## Backend Deployment (Render Web Service)
1. Go to [render.com](https://render.com) → New → Web Service.
2. Connect your GitHub repo.
3. **Root Directory**: Leave as default (repo root).
4. **Build Command**: `npm install`
5. **Start Command**: `npm run backend:start`
6. **Environment**: Add all env vars from `.env`.
7. **Plan**: Free tier.
8. Deploy. Note the URL (e.g., `https://strinex-backend.onrender.com`).

## Frontend Deployment (Render Static Site)
1. Go to [render.com](https://render.com) → New → Static Site.
2. Connect your GitHub repo.
3. **Root Directory**: `frontend/`
4. **Build Command**: Leave empty (no build needed).
5. **Publish Directory**: `.` (current directory, since files are in `frontend/`).
6. **Environment Variables**: None needed.
7. Deploy. Note the URL (e.g., `https://strinex.onrender.com`).

## Post-Deployment Updates
1. Update `frontend/config.js` BACKEND_API_URL to your Render backend URL (e.g., `https://strinex-backend.onrender.com`).
2. Update backend CORS_ORIGINS to include your Render frontend URL (e.g., `https://strinex.onrender.com`).
3. Redeploy both services.

## Testing
- Visit Render frontend URL.
- Test login, runs, chatbot.
- Check browser console for errors.

## Notes
- Frontend serves static files from `frontend/`.
- Backend runs on Render with persistent free tier.
- For production Clerk keys, update in config.js and backend env.