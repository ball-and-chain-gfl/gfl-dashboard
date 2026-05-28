# Ball & Chain GFL Dashboard

Fantasy football dashboard powered by the ESPN Fantasy API, deployed on Vercel.

## Setup

### 1. Clone / push to GitHub
Push this project to your GitHub account (`ball-and-chain-gfl`).

### 2. Deploy to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub account
2. Click **Add New → Project**
3. Import the `gfl-dashboard` repo
4. Before deploying, add these **Environment Variables** in the Vercel project settings:

| Key | Value |
|-----|-------|
| `ESPN_S2` | *(your espn_s2 cookie value)* |
| `ESPN_SWID` | `{914E533C-0C16-48AC-A3E2-E51D83ED8802}` |

5. Click **Deploy**

Your dashboard will be live at `https://gfl-dashboard.vercel.app` (or similar).

### 3. Updating cookies
ESPN cookies expire periodically (~1 year). When the dashboard stops loading data, grab fresh cookies from ESPN and update the environment variables in Vercel → Project Settings → Environment Variables.

## Features
- Current standings (W/L/PF/PA)
- Points for leaderboard
- Most active teams (moves + trades)
- Recent adds, drops, and trades activity feed
- Season switcher (2022–2025)
- Auto-refreshes on season change

## Adding more features
The proxy at `/api/espn.js` accepts any ESPN `view` parameter. Common views:
- `mTeam` — team records, transactions
- `mTransactions2` — recent activity feed
- `mMatchup` — weekly matchup scores
- `mRoster` — full rosters
- `mSettings` — league settings

## Tech
- Vercel serverless function (Node 18) for ESPN API proxy
- Vanilla HTML/CSS/JS frontend (no framework)
- ESPN private league auth via `espn_s2` + `SWID` cookies
