# Calm-1

**Calm, just a message away.** Calm-1 is an AI wellbeing companion that people message on WhatsApp, with an admin dashboard where the Calm team operates, evaluates and improves it.

- **WhatsApp companion.** Real two-way messaging through Meta's WhatsApp Cloud API, powered by Claude. It includes onboarding with consent, persistent conversations, opt-in memory, wellbeing tools (breathing, grounding, sleep, reflection, journaling, approved Calm content), opt-in check-ins, voice-note transcription, privacy commands and a layered safety system.
- **Admin dashboard.** Ten working sections: Overview, Conversations, Users, Memory, Content, Check-ins, Personality, Safety, Analytics and Settings. It also has a built-in conversation simulator that runs through the same engine as WhatsApp.

Calm-1 is not a therapist, a medical provider or an emergency service, and it says so.

---

## Quick start (no credentials needed)

```bash
npm install
npm run dev                # http://localhost:3000
```

1. Open the app and **Continue as local owner**. In development, no passcode is needed unless you set `ADMIN_PASSCODE`.
2. Go to **Overview → Conversation simulator**. Send "hi" to see onboarding exactly as a new WhatsApp user would see it.
3. To get real replies, add your key to `.env.local`:

   ```bash
   cp .env.example .env.local
   # set ANTHROPIC_API_KEY=sk-ant-…
   ```

   Without a key, the simulator reports *"Claude is not configured"*. It never makes up a reply.
4. Optional: open **Overview → Demo → Load demo data** (or run `npm run seed:demo`) to see the dashboard with synthetic data. It's labelled "Demo data" everywhere and never mixes with production metrics.

Local development stores everything in an encrypted JSON file in `./.data/`. The background worker also runs in-process, which handles memory extraction, summaries and check-ins. Production uses Supabase; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dashboard + API + in-process worker |
| `npm test` | Vitest suite (61 tests, including the full end-to-end journey) |
| `npm run typecheck` | TypeScript strict check |
| `npm run build` / `npm start` | Production build / serve |
| `npm run worker` | Dedicated background worker (production, long-running host) |
| `npm run seed:demo` | Load labelled synthetic demo data |
| `npm run safety:eval` | Run the safety evaluation suite (`-- --model` adds Claude review) |

## How a WhatsApp message flows

```
WhatsApp → POST /api/whatsapp/webhook
  → signature check (X-Hub-Signature-256) → de-duplicate (webhook_events)
  → identify user (keyed phone hash) → enqueue job (per-user lock → strict ordering)
  → worker: mark read + typing → [voice: download → transcribe]
  → engine: commands (STOP / MEMORY / DELETE…) → onboarding & consent
          → rate & cost limits → input safety (rules + model review)
          → context (recent history, rolling summary, retrieved memories, local time)
          → Claude + wellbeing tools (permission-checked)
          → output validation (unapproved links removed, safety checks, crisis resources)
          → persist (encrypted) → background memory extraction / summarisation
  → send via Cloud API → delivery statuses update the message
```

The dashboard simulator calls the same `handleInbound()` engine with `channel: "simulator"`.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): service boundaries, data model, memory, safety, personality, jobs
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): Supabase, Anthropic, Meta WhatsApp, webhooks, Vercel, the worker, check-in templates
- [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md): data handling, the security checklist, UK GDPR notes
- [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md): launch checklist and known limitations

## Stack

Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS with a custom design system · Lucide · Recharts · Framer Motion · Supabase Postgres (RLS) · Supabase Auth · Anthropic Claude (`@anthropic-ai/sdk`) · Meta WhatsApp Cloud API · Postgres-backed job queue · Upstash Redis rate limiting (optional) · Vitest.
