# OpenStudio (working title)

A zero‑dependency, open-source, self-hostable virtual radio studio. No SaaS required.
This starter pack includes architecture notes, signal flow, and a minimal local stack
(dockerized Icecast + coturn + a signaling stub) to help you go from zero to "on air."

## Quick start
```bash
# 1) copy and edit your station manifest
cp station-manifest.sample.json station-manifest.json

# 2) bring up infra (Icecast + coturn + signaling)
docker compose up -d

# 3) run the signaling dev server
cd server && npm install && npm run dev

# 4) open the web studio (scaffold placeholder)
cd ../web && npm install && npm run dev

# 5) point the studio to your signaling URL and go live
```

- See `ARCHITECTURE.md` and `SIGNAL_FLOW.md` for diagrams and routing details.
- Replace the signaling stub with your production logic as features land.
