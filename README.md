# FIFA26 Bracket Play

A lowest-cost hosted MVP for a friends-only FIFA26 World Cup prediction pool.

Users select match outcomes, with optional score predictions for exact-score bonuses:

- Group stage: home win, draw, away win
- Knockout stage: home team advances or away team advances
- Knockout bracket tab: Round of 32 through Final picks are saved together in a bracket flow
- Scoring: 2 points for a correct winner pick, 2.5 points for a correct group-stage draw pick, 1 bonus point for a correct score, 0 points for wrong picks

This implements the simplified version of the Cloudflare Pages + Worker + D1 approach from the design document.

## Tech stack

- Frontend: React + Vite
- API: Cloudflare Worker
- Database: Cloudflare D1 SQLite
- Utility scripts: Python

## Project structure

```text
frontend/          React/Vite app
worker/            Cloudflare Worker API
db/schema.sql      D1 schema
data/              CSV match seed format
scripts/           Python scoring, seeding, backup utilities
```

## MVP features implemented

- Create a league with admin PIN
- Join a league using invite code, display name, and PIN
- Login with invite code, display name, and PIN
- Show all matches
- Save one outcome pick per match
- Save full knockout bracket predictions with optional scores
- Lock predictions after kickoff
- Group-stage draw support
- Knockout draw disabled
- Admin login
- Admin manual result update
- Dynamic leaderboard

## Local setup

### 1. Install dependencies

```bash
cd worker
npm install

cd ../frontend
npm install
```

### 2. Create D1 database

```bash
cd worker
npx wrangler d1 create fifa26-bracket-play-db
```

Copy the generated `database_id` into `worker/wrangler.toml`.

### 3. Set a session secret

For local development:

```bash
cd worker
npx wrangler secret put SESSION_SECRET
```

Use any long random string.

### 4. Apply schema

```bash
cd worker
npm run db:apply:local
```

For remote:

```bash
npm run db:apply:remote
```

### 5. Seed sample matches

Generate SQL from CSV:

```bash
python ../scripts/seed_matches.py ../data/matches.sample.csv ../db/seed_matches.sql
```

Apply locally:

```bash
npx wrangler d1 execute fifa26-bracket-play-db --local --file ../db/seed_matches.sql
```

Apply remotely:

```bash
npx wrangler d1 execute fifa26-bracket-play-db --remote --file ../db/seed_matches.sql
```

### 6. Run API locally

```bash
cd worker
npm run dev
```

The Worker normally runs on `http://localhost:8787`.

### 7. Run frontend locally

Open another terminal:

```bash
cd frontend
VITE_API_BASE_URL=http://localhost:8787 npm run dev
```

On Windows PowerShell:

```powershell
cd frontend
$env:VITE_API_BASE_URL="http://localhost:8787"
npm run dev
```

## Deploy

### API

```bash
cd worker
npm run deploy
```

### Frontend

Deploy `frontend/` to Cloudflare Pages.

Set this Pages environment variable:

```text
VITE_API_BASE_URL=https://your-worker-url.workers.dev
```

Then build with:

```bash
npm run build
```

Output directory:

```text
dist
```

## API summary

```text
POST /api/leagues
POST /api/join
POST /api/login
POST /api/admin/login

GET  /api/league/:leagueId/matches
GET  /api/league/:leagueId/predictions/me
POST /api/predictions
GET  /api/league/:leagueId/leaderboard

POST /api/admin/matches/:matchId/result
POST /api/admin/recalculate
```

## Example payloads

Create league:

```json
{
  "name": "Our World Cup Pool",
  "adminPin": "1234"
}
```

Join league:

```json
{
  "inviteCode": "ABC123",
  "displayName": "Aditya",
  "pin": "1234"
}
```

Save prediction:

```json
{
  "matchId": "match_073",
  "predictedOutcome": "HOME_WIN",
  "predictedHomeScore": 2,
  "predictedAwayScore": 1
}
```

Update result:

```json
{
  "actualOutcome": "HOME_WIN",
  "actualHomeScore": 2,
  "actualAwayScore": 1
}
```

## Outcome values

```text
HOME_WIN
DRAW
AWAY_WIN
```

## Notes

- Store all kickoff times in UTC.
- The frontend displays kickoff time in the user's local browser timezone.
- Backend enforces prediction locking. Frontend locking is only for UX.
- The leaderboard is calculated dynamically, so fixing a result immediately updates standings.
