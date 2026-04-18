# Qurbani Receipt Management

Ijtemai qurbani receipts ka full digital workflow — pen/paper aur 6 Excel sheets ka manual kaam khatam.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind
- **Backend:** Node.js + Express + MongoDB (Mongoose)
- **Printer:** 58mm thermal (ESC/POS via `node-thermal-printer`), plus browser-print fallback
- **Auth:** JWT, role-based (admin / volunteer)

## Features

- Hinglish form: Naam, Address, Mobile, Type (Qurbani/Aqeeqah), Hisse, In/Out, Day (1/2/3)
- Auto unique receipt number (`Q-YYYY-XXXX`)
- Per-day-per-type serial number
- Multi-device + user tracking (kaun, kahaan se — device label)
- Search/filter/cancel entries
- 58mm thermal receipt + browser print
- Excel export:
  - **6 sheets** — Day1-IN, Day1-OUT, Day2-IN … Day3-OUT
  - **Master sheet** — per day, multiple tables with 7 rows each
- Dashboard: day-wise IN/OUT counts and hisse

## Setup

### Prerequisites
- Node.js 18+
- MongoDB running locally (or remote URI)

### Backend

```bash
cd backend
npm install
cp .env.example .env    # edit MONGO_URI / JWT_SECRET
node src/scripts/seed-admin.js admin admin123 "Administrator"
npm run dev
```
Backend runs on `http://localhost:5000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```
Frontend runs on `http://localhost:5173` (proxies `/api` to backend).

Login with `admin / admin123`, then go to **Users** and add volunteers.

## Multi-device setup

Each device should set a **Device Label** in the top bar (e.g., `Gate-1`, `Counter-2`). This is saved with every entry so you can trace which device / which user added it.

## Thermal Printer

Configured for Epson-compatible ESC/POS. Set the interface in `.env`:

```
PRINTER_INTERFACE=tcp://192.168.1.100    # network printer
# or
PRINTER_INTERFACE=printer:auto           # USB default
```

Request a print:
```
POST /api/print/receipt/:id
```

For browser fallback, `GET /api/print/receipt/:id/html` opens a 58mm-sized printable page.

## API (quick reference)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | login, returns JWT |
| GET  | `/api/auth/me` | current user |
| POST | `/api/auth/users` | add user (admin) |
| POST | `/api/entries` | new entry |
| GET  | `/api/entries` | search/list |
| PATCH| `/api/entries/:id` | edit |
| POST | `/api/entries/:id/cancel` | cancel |
| GET  | `/api/stats/summary` | dashboard stats |
| GET  | `/api/export/split` | 6-sheet Excel |
| GET  | `/api/export/master` | master sheet Excel |
| POST | `/api/print/receipt/:id` | thermal print |
| GET  | `/api/print/receipt/:id/html` | browser print |

## Data model

`QurbaniEntry`: receiptNo, serialNo, naam, address, mobile, type, hisse, qurbaniType (in/out), day (1–3), amount, createdBy, createdByName, deviceInfo.

`User`: name, username, passwordHash, role (admin/volunteer), active.

## Roadmap

- SMS confirmation to customer (Fast2SMS / Twilio)
- Duplicate-mobile warning at entry time
- Offline PWA mode
- Per-user activity logs
