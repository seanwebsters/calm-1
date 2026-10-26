# Production readiness

## Verified in this repository

| Area | Evidence |
| --- | --- |
| Type safety | `npm run typecheck`: strict, no errors |
| Build | `npm run build`: no warnings |
| Automated tests | `npm test`: 61 tests across 10 suites |
| End-to-end journey | `tests/e2e.test.ts`: join → onboard → chat → future event → return later → context-aware reply → breathing → memory off → check-in → opt out → delete |
| WhatsApp pipeline | `tests/whatsapp.test.ts` (Graph API mocked at the HTTP layer): handshake, signatures, duplicates, ordering, statuses, opt-out, encrypted payloads, real request shapes |
| Safety | 39/39 eval cases pass with rules only; output checks; model review can't clear critical hits |
| Dashboard | All ten sections render with real (or labelled demo) data; screenshots reviewed at 1440px |
| SQL migration | Applied cleanly to Postgres (PGlite) with Supabase's `auth`/role stubs; `claim_jobs()` checked to hold back a user's second job until the first finishes; `purge_expired()` runs |

## Not yet verified (needs credentials)

These code paths are complete but haven't been exercised against live services from this environment:

- **Real Claude replies.** No `ANTHROPIC_API_KEY` was available. Set one and send a message in the simulator.
- **A real WhatsApp conversation.** This needs a Meta app, number, token and public webhook URL (see DEPLOYMENT.md).
- **Template submission and sync with Meta**, and ElevenLabs voice transcription.
- **The Supabase backend.** The migration is validated against Postgres, but `SupabaseStore` hasn't run against a live Supabase project (the tests use the in-memory store behind the same interface). Apply the migration and work through the launch checklist below.

## Launch checklist

- [ ] Supabase migration applied; first owner created; `AUTH_PROVIDER=supabase`
- [ ] All production secrets set (see `.env.example`); `DATA_ENCRYPTION_KEY` backed up securely
- [ ] Claude reachable (System status); spend cap and per-user limits reviewed
- [ ] Meta webhook verified; test number round-trip works; delivery statuses arrive
- [ ] Check-in templates submitted and approved
- [ ] Catalogue: example rows replaced with approved Calm titles and links, then verified
- [ ] Personality reviewed by product/content; preview conversations signed off
- [ ] Safety: eval suite run in rules+model mode; crisis resources reviewed by the safety owner for each region; escalation and limitations language approved by clinical governance
- [ ] Privacy: DPIA complete; privacy notice published (bump `noticeVersion` when it changes); retention periods agreed; processor agreements signed
- [ ] Monitoring: error tracking wired up; alerts on dead jobs, webhook 5xx and the spend cap
- [ ] Load test: webhook burst (deduplication and ordering under concurrency); confirm worker throughput
- [ ] Backups and PITR enabled; restore rehearsed

## Known limitations and next steps

- **Analytics compute in the app** from row scans. Fine for a pilot; at scale, move to SQL views or materialised aggregates (the metric definitions in `lib/analytics/metrics.ts` carry over directly).
- **Semantic memory retrieval** is lexical plus structured. Add pgvector embeddings if recall needs to improve.
- **Spoken audio replies** aren't implemented. `user_preferences.voice_replies` is reserved; add TTS plus the WhatsApp audio message type behind that flag.
- **Language** is English-only copy. The catalogue and users have a `language` field, ready for localisation.
- **No human crisis escalation**, by design, until a separately approved process exists.
- **Local passcode auth** is for development and small pilots only; use Supabase Auth for named accounts.
