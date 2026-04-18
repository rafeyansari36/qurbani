# Deployment Guide — Render (backend) + Vercel (frontend)

Architecture: **Vercel (React)** ←HTTPS→ **Render (Express)** ←→ **MongoDB Atlas**.

> **Thermal printer note:** Render cloud se aapke local USB thermal printer tak reach nahi hota. Deploy ke baad thermal print button kaam nahi karega. **PDF A4, PDF 58mm, aur Browser Print (58mm HTML)** cloud se theek chalega.

---

## 1. MongoDB Atlas (free)

1. https://www.mongodb.com/cloud/atlas pe signup
2. Free shared cluster (M0) banayein, region India (Mumbai) ke paas choose karein
3. **Database Access** → naya user banayein (username/password yaad rakhein)
4. **Network Access** → "Allow from Anywhere" (`0.0.0.0/0`) add karein
5. **Connect** → "Drivers" → connection string copy karein, e.g.:
   ```
   mongodb+srv://<user>:<password>@cluster0.abcd.mongodb.net/qurbani?retryWrites=true&w=majority
   ```

## 2. Code ko GitHub pe push karein

Repo structure:
```
qurb/
├── backend/      ← Render isko deploy karega
├── frontend/     ← Vercel isko deploy karega
├── DEPLOY.md
└── README.md
```

Ek single GitHub repo mein dono folders push karein.

## 3. Backend — Render pe deploy

### Method A: `render.yaml` (recommended)

1. https://render.com login → **New +** → **Blueprint**
2. GitHub repo connect karein
3. Render automatically `backend/render.yaml` detect karega
4. Required **secret env vars** fill karein (jo `sync: false` hain):
   - `MONGO_URI` → Atlas connection string (step 1 se)
   - `CORS_ORIGIN` → Vercel URL (step 4 ke baad pata chalega, abhi `*` rakhein, baad mein update karein)
   - `SEED_ADMIN_PASSWORD` → ek strong password (min 6 chars) — yeh **first admin ka password** hai
5. Deploy click karein

`JWT_SECRET` Render automatically generate kar dega. `SEED_ADMIN_USERNAME` default `admin` hai.

### Method B: Manual Web Service

1. **New +** → **Web Service** → GitHub repo connect karein
2. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
3. **Environment Variables** add karein (same as above `render.yaml`)
4. Deploy

### First deploy ke baad

Logs mein dekhenge:
```
MongoDB connected
[seed] First admin created: username="admin"
Server running on port 10000
```

Agar `SEED_ADMIN_PASSWORD` set nahi tha to warning aayegi — env var add karke **Manual Deploy** ya restart karein.

Backend URL note karein: `https://qurb-backend-XXXX.onrender.com`

Test: `https://qurb-backend-XXXX.onrender.com/api/health` → `{"ok":true,...}`

## 4. Frontend — Vercel pe deploy

1. https://vercel.com login → **Add New** → **Project**
2. GitHub repo import karein
3. **Root Directory**: `frontend`
4. Framework: **Vite** (auto-detect)
5. **Environment Variables** add karein:
   - `VITE_API_BASE_URL` = `https://qurb-backend-XXXX.onrender.com/api`
     (step 3 ke backend URL + `/api`)
6. Deploy

Vercel URL milega: `https://qurb-frontend-XXXX.vercel.app`

### Custom domain (optional)

Vercel dashboard → Settings → Domains → apna domain add karein.

## 5. CORS connect karein

Ab Render par jaayein → Environment → `CORS_ORIGIN` update karein:
```
CORS_ORIGIN=https://qurb-frontend-XXXX.vercel.app
```
Agar custom domain hai to comma-separated list:
```
CORS_ORIGIN=https://qurb.mydomain.com,https://qurb-frontend-XXXX.vercel.app
```
`ALLOW_VERCEL_PREVIEWS=true` rahega taaki har PR preview bhi chale.

**Manual Deploy / Restart** karein — Render restart ho jayega.

## 6. First login

1. Vercel URL kholein
2. Login: `admin` / (`SEED_ADMIN_PASSWORD` jo aapne set kiya tha)
3. **Users** page pe jaake volunteers add karein

## 7. Free-tier caveats

- **Render free**: 15 min idle ke baad sleep hota hai. First request 30-60s slow hogi. Event ke time pe 2-3 dummy requests pehle hit karke "warm" kar lein, ya paid plan ($7/mo) pe upgrade karein.
- **Atlas free (M0)**: 512MB storage — qurbani data ke liye bahut zyada hai.
- **Vercel free (Hobby)**: unlimited static requests.

## 8. Updates deploy

- Backend code change → GitHub `main` push → Render auto-deploys
- Frontend code change → GitHub `main` push → Vercel auto-deploys

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| Login fails with "CORS blocked" | Render `CORS_ORIGIN` mein Vercel URL add karein |
| `Network Error` in browser | `VITE_API_BASE_URL` galat hai — Vercel env vars check karein, re-deploy |
| Backend `MongoDB connection error` | Atlas `0.0.0.0/0` whitelist + correct `MONGO_URI` password |
| First admin nahi bana | Render logs check — `SEED_ADMIN_PASSWORD` missing ya DB mein already user hai |
| Forgot admin password | Atlas pe jaake `users` collection se entry delete karein, Render restart karein → auto-seed re-run |
| Slow first load | Render free tier cold start — upgrade to paid or use warming cron |

## 10. Optional — daily backup

Atlas free tier pe manual export:
```bash
mongodump --uri="<MONGO_URI>" --out=./backup-$(date +%Y%m%d)
```
Paid plans pe automated backup built-in.
