# Jasola Skyline Towers – RWA Issue Register

Public, read-only website listing society issues handled by the RWA and by
authorities (DDA ELD-1, DDA EMD-7, DDA Housing, DDA Horticulture, MCD, PWD,
Traffic Police, Delhi Police): status pie chart, owners, target dates, and
the follow-up timeline for each issue.

## Files

| File | What it is |
|---|---|
| `index.html` | The website. Self-contained; data is embedded in the `public-data` block. |
| `data/public-data.json` | The same published data as plain JSON (for a future website or backup). |
| `source.html` | The page source used by the admin version on claude.ai (no data embedded). |
| `logo.png` | Society logo. |

## How data gets here

Admins add and edit issues in the admin version on claude.ai
(https://claude.ai/artifact/CXHBgCJCco9oGovGmAuXWj), which has the password
login, photo/letter uploads and the live database. This repository holds an
exported, public copy:

- Resident names ("Raised by") and steps marked *Admin only* are removed.
- Photos and letters uploaded on claude.ai are **not** included yet; they stay
  on claude.ai.

To update the website, export the data again and replace the `public-data`
block in `index.html` and `data/public-data.json`, then commit.
