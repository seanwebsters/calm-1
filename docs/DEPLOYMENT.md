# Deployment

The recommended production setup:

| Piece | Where |
| --- | --- |
| Web app + API + webhook | Vercel (or any Node 20+ host; the `Dockerfile` is included) |
| Database + staff auth | Supabase (Postgres + Auth) |
| Background work | Vercel Cron → `/api/cron/tick` every minute, **or** `npm run worker` on Railway/Fly/Render |
| Rate limits across instances | Upstash Redis (optional) |

## 1. Supabase

1. Create a project. Choose an EU/UK region if you serve UK users.
2. Apply the schema. Either run `supabase db push` with the CLI linked to this repo, or open the SQL editor and paste the contents of `supabase/migrations/0001_init.sql`.
3. From Project Settings → API, copy:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`, which goes **only** in server environment variables
   - `SUPABASE_ANON_KEY`, which is used only for the staff sign-in call
4. In Authentication → Providers, keep Email enabled. Turn off public sign-ups: staff accounts are created by invitation.
5. Create the first owner:
   1. Authentication → Users → *Add user* (email + password).
   2. In the SQL editor, run:
      ```sql
      insert into admin_users (email, name, role) values ('you@calm.com', 'Your Name', 'owner');
      ```
      The first sign-in links the Auth user automatically.
6. Set `AUTH_PROVIDER=supabase`. After that, owners add teammates in **Settings → Team**: create them in Supabase Auth, then add them in the dashboard with a role.

RLS is enabled and forced on every table, and the `anon` role has no grants. Signed-in staff can read a few non-sensitive operational tables directly (for BI tools). Messages, memories, journal entries, users and consents have no client policies at all; they're only reachable through the app's permissioned, audited routes.

## 2. Anthropic

1. Create an API key in the Anthropic Console and set `ANTHROPIC_API_KEY`.
2. In the Console, set spend limits and confirm your data-retention configuration. Record it in your DPIA.
3. Models and parameters are changed in **Settings → AI configuration**:
   - Default model: `claude-opus-5-5`.
   - Reply effort: `low`.
   - Daily spend cap: $50.
4. Check **Overview → System status → Claude API**. It turns *Operational* after a real API check.

## 3. Meta WhatsApp Cloud API

1. In Meta for Developers, create an app of type **Business** and add the **WhatsApp** product.
2. Add and verify a phone number, or start with the test number. Note its **Phone number ID** and the **WhatsApp Business Account ID**.
3. Create a **System User** in Business Settings with `whatsapp_business_messaging` and `whatsapp_business_management`, and generate a permanent token. That token is `WHATSAPP_ACCESS_TOKEN`.
4. From App settings → Basic, copy the **App secret** into `WHATSAPP_APP_SECRET`.
5. Pick a random `WHATSAPP_VERIFY_TOKEN`.
6. Deploy the app, then in WhatsApp → Configuration → Webhook:
   - Callback URL: `https://<your-domain>/api/whatsapp/webhook` (Settings → WhatsApp shows the exact URL)
   - Verify token: your `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
7. Send "hi" to the number from your phone. You should get the Calm-1 welcome. The conversation then appears under Conversations → WhatsApp, with content hidden unless opened with a reason.

### Check-in templates

Outside the 24-hour customer-service window, WhatsApp only allows approved templates. Calm-1 creates three draft templates (morning, evening, bedtime).

1. In **Check-ins → Message templates**, review the wording and **Submit** each one. This needs `WHATSAPP_BUSINESS_ACCOUNT_ID`.
2. Click **Sync status** to pull approval and Meta's final category.
3. Until a template is approved, out-of-window check-ins fail visibly, with the reason "no approved template". Calm-1 never sends anything non-compliant.

Users opt in to check-ins in conversation ("check in on me every morning"). That opt-in is recorded in `user_consents`. STOP or STOP CHECK-INS removes it immediately.

## 4. Environment variables

See `.env.example`. These are required in production:

- `DATA_ENCRYPTION_KEY`
- `PHONE_HASH_PEPPER`
- `SESSION_SECRET`
- The Supabase variables
- `ANTHROPIC_API_KEY`
- The WhatsApp variables
- `CRON_SECRET` (with Vercel Cron)

The app refuses to start its data layer in production without Supabase and the encryption key.

Generate secrets with:

```bash
openssl rand -base64 32   # DATA_ENCRYPTION_KEY
openssl rand -hex 32      # SESSION_SECRET, PHONE_HASH_PEPPER, CRON_SECRET, WHATSAPP_VERIFY_TOKEN
```

## 5. Vercel

1. Import the repository.
2. Add the environment variables to Production (and Preview if needed).
3. `vercel.json` schedules `/api/cron/tick` every minute. Per-minute crons need a paid Vercel plan; otherwise run the worker below.
4. Set `CRON_SECRET`. Vercel sends it as a bearer token.
5. The webhook returns quickly after enqueueing, then processes with `after()`. The cron tick is the safety net for anything left over.

## 6. Dedicated worker (alternative to or alongside cron)

```bash
docker build -t calm-1 .
docker run --env-file .env calm-1 npm run worker
```

You can run several workers safely, because `claim_jobs()` is atomic and keeps per-user ordering.

## 7. Verify

- `npm run typecheck && npm test && npm run build`
- `/api/health/live` returns `{ ok: true }`. It's unauthenticated and reveals nothing.
- Overview → System status: each service shows *Operational* only after a live check.
- Run **Safety → Evaluation suite → Run (rules + model)** and keep the baseline.
