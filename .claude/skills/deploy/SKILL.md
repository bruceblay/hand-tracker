---
name: deploy
description: Build and deploy hand-tracker to Vercel production at hands.coolbrb.com, then verify it responds 200.
---

# Deploy to Vercel

Project: `bruceblays-projects/hand-tracker` (linked via `.vercel/project.json`)
Production URL: https://hands.coolbrb.com

## Steps

Run from the repo root.

1. **Build** — `npm run build`. Stop and report if it fails.
2. **Deploy** — `vercel deploy --prod --yes --scope bruceblays-projects`. Stop and report if it fails.
3. **Verify** — `curl -sI https://hands.coolbrb.com | head -1`. Expect `HTTP/2 200`. If not, report the status line and the deployment URL from step 2 so the user can inspect.

Report the production URL from step 2 and the verify result. Don't commit, push, or touch git — deployment is independent of git state. The CLI bundles the working tree, so any local changes go live.
