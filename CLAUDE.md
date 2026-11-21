# Medi Waypoint — agent instructions

Before any task, read [MASTERPLAN.md](MASTERPLAN.md). It holds the shared
contracts (roles, state machines, API, data shapes), settled decisions and open
questions, and tells you which of these to read next:

- [docs/BACKEND.md](docs/BACKEND.md)
- [docs/FRONTEND.md](docs/FRONTEND.md)
- [docs/UIUX_DESIGN.md](docs/UIUX_DESIGN.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

Rules:

1. Do not invent states, endpoints, fields, roles or clinical content. If it
   is not in MASTERPLAN or the owning document, ask or record an open question.
2. Contract changes: edit MASTERPLAN first, update BACKEND and FRONTEND in the
   same change, add a row to MASTERPLAN §10 (Interface ledger).
3. Open questions (MASTERPLAN §8.2) stay open in code: feature flag or adapter,
   tagged with the question ID.
4. UI work follows UIUX_DESIGN.md tokens and motion rules; no raw hex values,
   no decorative animation.
