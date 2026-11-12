# Jasola Skyline Towers – RWA Issue Register

Live site: **https://jasola-skyline-issues.pages.dev/**

Lists society issues handled by the RWA and by authorities (DDA ELD-1, DDA EMD-7,
DDA Housing, DDA Horticulture, MCD, PWD, Traffic Police, Delhi Police) with a status
pie chart, owners, target dates, and a follow-up timeline with letters and GPS photos.
Anyone can view it; RWA admins log in on the site to add and edit.

## How it's built (Cloudflare, free plan)

| Path | What it is |
|---|---|
| `public/index.html` | The website (single page, no build step) |
| `functions/api/[[path]].js` | API: public data, admin login, save issues/lists, uploads, password change |
| `functions/files/[id].js` | Serves uploaded photos and letters |
| `schema.sql` | D1 database tables |
| `scripts/seed.py` | Builds seed SQL from a claude.ai export and sets the admin password |
| `wrangler.toml` | Cloudflare bindings: D1 `DB` (jasola-issues), KV `FILES` |

Security: the admin password is stored as a PBKDF2 hash in D1 and checked on the
server; sessions are signed HttpOnly cookies (12 h); 10 wrong passwords in 15 minutes
locks login for that IP. Public responses never include "Raised by" or steps marked
admin-only.

## Deploy a code change

    npx wrangler pages deploy --branch main

## Local testing

    npx wrangler d1 execute jasola-issues --local --file schema.sql
    npx wrangler pages dev public --d1 DB=93704867-7c53-443d-bcd4-df2a4b734627 --kv FILES

The root `index.html` only redirects the old GitHub Pages address to the live site.
