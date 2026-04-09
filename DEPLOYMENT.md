# Strinex Deployment Guide

## Prerequisites
1. **GitHub Repository**: Push your code to GitHub.
2. **MongoDB Atlas**: Set up a free MongoDB cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
3. **Clerk Account**: Get production keys from [clerk.com](https://clerk.com).
4. **Gemini API Key**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey).
5. **Vercel Account**: Sign up at [vercel.com](https://vercel.com).
6. **Render Account**: Sign up at [render.com](https://render.com).

## Environment Variables
Create `.env` file in backend/:
```
MONGODB_URI=mongodb+srv://...
GEMINI_API_KEY=...
CLERK_SECRET_KEY=sk_live_...
CORS_ORIGINS=https://your-frontend.vercel.app,https://your-backend.onrender.com
PORT=5000
```

## Backend Deployment (Render)
1. Go to [render.com](https://render.com) → New → Web Service.
2. Connect your GitHub repo.
3. **Build Command**: `npm install`
4. **Start Command**: `npm run backend:start`
5. **Environment**: Add all env vars from `.env`.
6. **Plan**: Free tier.
7. Deploy. Note the URL (e.g., `https://strinex-backend.onrender.com`).

## Frontend Deployment (Vercel)
1. Go to [vercel.com](https://vercel.com) → New Project.
2. Import your GitHub repo.
3. **Framework Preset**: Other.
4. **Root Directory**: `frontend/`
5. **Build Settings**: No build command (static site).
6. **Environment Variables**: None needed (config.js handles it).
7. Deploy. Note the URL (e.g., `https://strinex.vercel.app`).

## Post-Deployment Updates
1. Update `frontend/config.js` BACKEND_API_URL to your Render backend URL.
2. Update backend CORS_ORIGINS to include Vercel frontend URL.
3. Redeploy both services.

## Testing
- Visit Vercel URL.
- Test login, runs, chatbot.
- Check browser console for errors.

## Notes
- Frontend serves static files from `frontend/`.
- Backend runs on Render with persistent free tier.
- For production Clerk keys, update in config.js and backend env.