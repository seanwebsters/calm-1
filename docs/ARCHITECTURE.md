# Architecture

```
src/
  app/
    (admin)/            Dashboard: overview, conversations, users, memory, content,
                        checkins, personality, safety, analytics, settings
    api/                Route handlers (all permission-checked; mutations audited)
      whatsapp/webhook  Meta webhook (GET verify, POST events)
      cron/tick         Scheduler heartbeat for serverless hosts
      simulator/*       Test conversations through the production engine
    login, forbidden
  components/
    ui/                 Design-system primitives (button, card, badge, inputs, table, dialog…)
    admin/              Sidebar, KPI cards, charts, simulator, system status, filters
  lib/
    engine/             Channel-agnostic conversation engine (turn.ts), commands, copy,
                        conversation persistence, summarisation
    llm/                Claude adapter, pricing, cost recording
    personality/        Immutable core prompt + versioned, editable house style & traits
    safety/             Rules, model review, output checks, resources, eval suite
    memory/             Extraction (structured output), sensitivity filter, retrieval
    tools/              Wellbeing tool registry + vetted exercise scripts
    content/            Approved Calm catalogue
    checkins/           Preferences, DST-safe scheduling, delivery, templates
    whatsapp/           Cloud API client, webhook verification/parsing, channel adapter
    voice/              Transcription provider (ElevenLabs Scribe)
    jobs/               Durable queue, handlers, scheduler tick, in-process dev worker
    analytics/          Metrics computed from records
    auth/               Roles & permissions, signed sessions, audit log
    db/                 Store interface + Supabase and local implementations, row types
    users/              Identity, consent ledger, preferences, export, erasure
    crypto.ts           AES-256-GCM field encryption, keyed phone hashing
    settings.ts         Runtime settings (edited in the dashboard, no redeploy)
supabase/migrations/    Schema, indexes, RLS, claim_jobs(), purge_expired()
scripts/                worker, demo seed, safety eval CLI
tests/                  Vitest suites incl. end-to-end journey
```

## Service boundaries

Each of these can change without touching the others:

| Boundary | Interface | Swap by |
| --- | --- | --- |
| Channel | `handleInbound(InboundInput) → TurnResult` | Writing a new adapter (the WhatsApp one is `lib/whatsapp/adapter.ts`) |
| Model | `Llm.create(LlmRequest) → LlmResponse` | Implementing `Llm` (tests use a scripted fake) |
| Storage | `Store` (insert/find/update/…/claimJobs) | `SupabaseStore` in production, `LocalStore` in dev/tests |
| Transcription | `transcribe(buffer, mime)` | Replacing `lib/voice/transcribe.ts` |
| Safety | `assessInput` / `assessOutput` | Rules + optional model review; policy versioned |

## Conversation engine (`lib/engine/turn.ts`)

1. **Persist inbound.** The message is stored encrypted, the user's activity timestamps update, and any recent check-in is marked as replied to.
2. **Stopped users.** Only START, DELETE MY DATA and HELP do anything.
3. **Commands.** These are deterministic and never touch the model: STOP, START, HELP, MEMORY, MEMORY ON/OFF, FORGET n, FORGET ALL, JOURNAL, CHECK-INS, PAUSE/RESUME/STOP CHECK-INS, EXPORT, DELETE MY DATA → CONFIRM DELETE.
4. **Onboarding.** A welcome message and privacy notice. Reply `1` to start, or `2` to start with memory on. **No model call happens before consent.** Crisis resources are still sent before consent, using rules only. If the person's first message was substantive, it's answered as soon as they consent.
5. **Limits.** A per-user burst limit, a per-user daily reply limit and a global daily AI spend cap.
6. **Input safety.** See the Safety section below.
7. **Context.**
   - The last N messages since the rolling summary. Commands and their replies are left out.
   - The summary of older messages.
   - The user's local date and time.
   - Retrieved memories, when memory is on.
   - Check-in state.
   - Safety guidance for the turn.
8. **Model loop.** Claude with the tool registry, up to `maxToolRounds`. Tool inputs are validated with zod and permission-checked against the turn's safety allow-list.
9. **Output validation.** Any URL that isn't in the verified catalogue (or returned by a tool this turn) is removed. Then `assessOutput` runs. Every intervention is logged.
10. **Persist outbound** with latency, tokens, model and prompt version, then enqueue memory extraction and summarisation.

### Claude request shape

- The system prompt has two blocks. The first is stable (core + house style + traits + tool guidance) and carries `cache_control`, so it's reused across turns. The second holds per-turn context.
- Opus 5.5 always uses adaptive thinking. Reply effort defaults to `low` to keep WhatsApp latency down, and it's configurable.
- Server-side refusal fallback is on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). A declined request is retried on Anthropic's recommended model. If the whole chain declines, the user gets a safe fallback reply.
- Background work (memory extraction, safety review) uses structured outputs (`output_config.format` with a JSON schema).
- Thinking blocks are passed back unchanged within a turn's tool loop. Persisted history holds only text.

## Memory

| Layer | Where |
| --- | --- |
| Short-term | Recent messages in the active conversation, plus a rolling summary (`conversations.summary_enc`) |
| Long-term | `memories` table. Encrypted, typed (name, preference, goal, style, technique, event, context); events carry a date and expire after it |
| Retrieval | `selectMemories()` picks the profile, events from yesterday to a week ahead, and lexically related memories, within a limit |

Extraction runs as a background job after each user message, and only when the user has opted in. Claude proposes candidates against a strict schema, and each candidate carries a `sensitive_category`. `filterCandidates()` drops special-category data, low-confidence items, undated events and invalid updates. Every decision (`created`, `rejected` with a reason, `retrieved`, `deleted`) is written to `memory_events`.

Users can list (MEMORY), delete (FORGET n / FORGET ALL), disable (MEMORY OFF) and export memories. Deleting a memory overwrites its ciphertext.

> Semantic retrieval: lexical + structured retrieval is enough at MVP scale (≤60 memories per user). To add embeddings, store a vector per memory with pgvector and blend the similarity into `selectMemories` scoring. The interface doesn't change.

## Personality

- **Core prompt** (`personality/prompt.ts`). This is immutable and always comes first. It covers AI disclosure, emergency limits, no diagnosis or medication advice, no method information, autonomy, catalogue-only content, and resistance to prompt injection.
- **House style.** Editable instructions, versioned in `prompt_versions` with a draft → publish workflow, rollback (which creates a new version that copies an old one), and one published version enforced by a unique index.
- **Traits.** Seven 0–100 sliders, each rendered into a concrete instruction band. Response length also sets the word budget.
- **Preview.** A stateless side-by-side comparison of the live version against a draft, run through the real model.

## Safety

1. **Input rules.** These are deterministic, version-pinned (`safety-2026.10`) and negation-aware.
2. **Model review.** This runs for flagged or ambiguous messages. It can escalate a rule result, or soften a non-critical rule hit by at most one level. It can never clear a critical hit.
3. **Response guidance and tool allow-list.** These are set per category and severity, and use region-specific resources (UK, US, IE, AU, international).
4. **Output checks.** These cover doses, methods, diagnoses and claims to be human. The reply is replaced by a vetted fallback when needed, and crisis resources are added when a high-risk reply leaves them out.
5. **Logging.** Category, severity, layer, rule and action are recorded. No message text is logged. A review workflow on the dashboard handles false positives.

The eval suite (`safety/eval.ts`, 39 synthetic cases) checks both recall and over-flagging of ordinary sadness. It runs from the dashboard, the CLI and the test suite.

## Jobs & ordering

- `jobs` is a Postgres-backed queue. `claim_jobs()` claims atomically with `FOR UPDATE SKIP LOCKED`.
- For each `lock_key` (`user:<id>`), only the oldest queued job can run, and only while no other job with that key is running. This keeps one person's messages strictly ordered, even across several workers and retries.
- Retries back off exponentially. After `max_attempts` a job is marked dead and shows under Settings → System, where it can be retried.
- The scheduler tick recovers stuck jobs, sends due check-ins, schedules a daily retention sweep, drains the queue and records a heartbeat for health checks.
- Hosting options for the tick: Vercel Cron (`/api/cron/tick`), the long-running worker (`npm run worker`), or in-process in development.

## Data model

All tables are in `supabase/migrations/0001_init.sql`. They mirror the row types in `lib/db/types.ts` and use UUID keys, foreign keys with cascade, indexes on every hot path, and RLS on every table.

## UI

The design system is built from Tailwind tokens (`tailwind.config.ts`): off-white canvas, white cards, thin borders, dark navy ink and a single Calm-blue accent. Primitives live in `components/ui`. They follow shadcn/ui conventions but are written in-repo, with no Radix dependency, so they stay small and fully styled. Chart colours were checked with a colour-vision-deficiency (CVD) palette validator. Every chart has a legend for two or more series, tooltips, and a table view where it matters.
