# MATCHPOIN GLOBAL RULES
- UI text: Bahasa Indonesia. Code/comments/DB names: English.
- Do NOT rebuild the app. Preserve working features. Change incrementally.
- Check existing migrations/schema before changing the DB.
- Enforce permissions server-side/DB, not just frontend. Players cannot bypass via API. Hosts access only their own community.
- Server-side timestamps. Prevent duplicate submissions. Audit log all status changes.
- Responsive: desktop + mobile.
- Roles: HOST (community admin) and PLAYER. Players CANNOT create matches or submit scores.
- Match statuses: PENDING, CONFIRMED, DISPUTED, REJECTED. Only CONFIRMED affects history/ranking.
- Tournaments are removed for now.

# TOKEN RULES
- Open only files relevant to the current phase. Do not scan the whole repo.
- Ignore node_modules, .next, build output, large assets.
- Use grep/search to locate code before opening files.
- Edit with small diffs; never rewrite whole files.
- No long explanations. Final summary: max 5 lines.

# GIT RULES (agent handles all git; the user will not run git)
- Work on branch `revisi-host`. If it does not exist, create it.
- Before starting a phase, make sure the working tree is clean; if not, commit it as "wip before phase N".
- After the phase works (build/tests pass), run: git add -A && git commit -m "phase N: <short title>".
- If the build fails after 2 fix attempts, stop and report. Do NOT commit broken code.
- DB backup: before any phase that changes the schema or data, copy the DB file or run the export command to backups/ (timestamped).