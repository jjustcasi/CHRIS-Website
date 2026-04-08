# CHRIS Backend Setup (Node.js + MongoDB)

## 1. Go to server folder

```powershell
cd server
```

## 2. Install dependencies

```powershell
npm install
```

## 3. Create environment file

Create `.env` in `server` and copy values from `.env.example`:

```env
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/chris_db
```

You can replace `MONGODB_URI` with your MongoDB Atlas connection string.

## 4. Start backend

```powershell
npm run dev
```

Backend URL:

- `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`

## 5. Open frontend through a local web server

Use Live Server extension or similar (do not use `file://` URL).

## What is already migrated

- Signup uses `POST /api/auth/signup`
- Login uses `POST /api/auth/login`
- Users are stored in MongoDB

## Notes

- Existing dashboard modules still use browser storage for now (leave, training, attendance, PDS, announcements).
- Next step is migrating those modules to backend APIs one by one.
