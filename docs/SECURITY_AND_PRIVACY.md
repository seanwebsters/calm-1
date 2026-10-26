# Security & privacy

Wellbeing conversations are treated as sensitive data from end to end. This document describes what the system does. **It is not a statement of legal compliance.** Compliance with UK GDPR and other applicable law needs a formal review: a DPIA, a lawful-basis assessment (including Article 9 special-category data), processor agreements with Anthropic, Meta, Supabase and ElevenLabs, a published privacy notice and a retention schedule.

## What's stored, and how

| Data | Storage | Notes |
| --- | --- | --- |
| Phone number | `phone_hash` (HMAC with `PHONE_HASH_PEPPER`) + `phone_enc` (AES-256-GCM) + last 4 digits | Staff see a masked number; the decrypted value is needed only to reply |
| WhatsApp profile name | Not stored | Ignored from the webhook payload |
| Message text | `messages.content_enc`, AES-256-GCM | Deleted after the retention period (default 180 days) |
| Memories | `memories.content_enc` | Off by default; special-category data is filtered out; deleting overwrites the ciphertext |
| Journal | `journal_entries.content_enc` | Only on explicit request, after consent |
| Conversation summary | `conversations.summary_enc` | Rolling summary with no phone numbers or third-party names |
| Job payloads | Text encrypted (`textEnc`) | Queued work never holds plain text |
| Safety events | Category, severity, rule, action | **No message text** |
| Analytics / costs | Counts and token totals | Unlinked from the person on erasure |
| Voice notes | Not stored | Downloaded, transcribed in memory, discarded |

Encryption keys live in environment secrets. Supabase also encrypts data at rest at the disk level, and all traffic uses TLS.

## Consent

- **Onboarding.** AI disclosure and a short privacy notice. The model processes nothing until the user agrees (`privacy_notice` consent).
- **Memory.** Opt-in at onboarding (reply 2) or with MEMORY ON.
- **Journal.** Explicit confirmation the first time.
- **Check-ins.** Explicit request in conversation.
- **Withdrawal.** Every consent is withdrawable with one word.
- **Ledger.** Consents are an append-only ledger (`user_consents`) that records the notice version.
- **Safety before consent.** Crisis resources are still sent before consent, based on rules only, on a vital-interests basis. This should be assessed in the DPIA.

## User rights

- **Access.** EXPORT on WhatsApp sends a JSON file. Staff can also export on request; this is audited.
- **Erasure.** DELETE MY DATA → CONFIRM DELETE erases immediately. Staff erasure is audited. Proof of erasure keeps only the anonymous ID.
- **Rectification.** Users can FORGET a memory; staff can correct memories via support (audited).
- **Objection.** STOP ends all processing and messaging.

## Staff access

- **Roles.** Owner, Administrator, Operator, Safety reviewer, Analyst (see `lib/auth/roles.ts`).
- **Server-side checks.** Every page and API route checks permissions on the server. Middleware rejects unauthenticated requests.
- **Production transcripts.** Opening one requires `transcripts.view`, a written reason, and the Privacy setting enabled. Each access is audited.
- **Memories and exports.** Per-user memories and exports also require a reason and are audited.
- **Analysts** see aggregates only.
- **Audit log.** Sign-ins, configuration changes, publishing, content edits, reviews, transcript access, exports and erasures are written to `admin_audit_logs`.
- **Sessions.** HMAC-signed, httpOnly, SameSite=Lax and Secure in production, with a 12-hour lifetime. The admin record is re-checked on every request, so deactivating someone takes effect immediately.

## Platform security checklist

- [x] Webhook authenticity: `X-Hub-Signature-256` verified with timing-safe comparison against the raw body
- [x] Webhook verification token compared in constant time
- [x] Idempotent webhook processing (`webhook_events.external_id` unique)
- [x] Secrets only in server environment variables; nothing sensitive uses a `NEXT_PUBLIC_` prefix; the dashboard shows only "Set" / "Not set"
- [x] RLS forced on all tables; service-role key used only on the server; `anon` revoked
- [x] Rate limits on login, the webhook and per-user replies, plus a global AI spend cap
- [x] Input validation with zod on every route; structured errors with no stack traces
- [x] Security headers (HSTS, nosniff, frame-deny, referrer policy, permissions policy)
- [x] Structured logs with sensitive keys redacted; no message content logged
- [x] Model output restricted: catalogue-only links, safety output checks
- [x] Prompt-injection resistance: the core prompt treats user text as conversation, and personality edits can't override it
- [ ] Penetration test before launch
- [ ] Key rotation runbook (re-encrypt with a dual-key period)
- [ ] Error monitoring service (Sentry or similar), with PII scrubbing configured
- [ ] Backups and point-in-time recovery enabled in Supabase; restore tested

## Model providers

- **Anthropic.** Message text and context are sent to generate replies. Under Anthropic's commercial terms, API data isn't used to train models. Confirm the organisation's retention configuration (and zero-data-retention eligibility, if required) in the Console, and record it.
- **Meta.** Messages pass through WhatsApp, which is end-to-end encrypted to the Cloud API endpoint. Meta's own terms apply to the Cloud API.
- **ElevenLabs.** Only voice-note audio is sent, for transcription.

Calm-1 does **not** use conversations for training or evaluation. The safety eval suite uses only synthetic cases. Quality reviews store ratings and tags, never copied text.
