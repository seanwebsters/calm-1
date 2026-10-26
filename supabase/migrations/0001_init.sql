-- Calm-1 schema.
-- Conventions
--   * UUID primary keys, timestamptz everywhere.
--   * Columns ending in _enc hold AES-256-GCM ciphertext written by the app
--     (lib/crypto.ts). Postgres never sees wellbeing text in clear.
--   * Every table has Row Level Security enabled. The server uses the
--     service-role key; the only policies granted to signed-in staff are
--     read-only access to aggregate/operational tables, checked against
--     admin_users. Nothing is readable with the anon key.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- people
create table users (
  id uuid primary key default gen_random_uuid(),
  anon_id text not null unique,
  channel text not null check (channel in ('whatsapp','simulator','demo')),
  phone_hash text unique,
  phone_enc text,
  phone_last4 text,
  country_code text,
  test_label text,
  language text not null default 'en',
  timezone text not null default 'Europe/London',
  status text not null default 'onboarding' check (status in ('onboarding','active','opted_out','deleted')),
  onboarding_step text not null default 'new' check (onboarding_step in ('new','awaiting_consent','done')),
  message_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_active_at timestamptz,
  last_inbound_at timestamptz,
  deleted_at timestamptz
);
create index users_channel_created_idx on users (channel, created_at);
create index users_last_active_idx on users (last_active_at);

create table user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  memory_enabled boolean not null default false,
  journal_enabled boolean not null default false,
  voice_replies boolean not null default false,
  conversation_style text,
  updated_at timestamptz not null default now()
);

-- Append-only consent ledger; the latest row per (user, kind) is current.
create table user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('privacy_notice','memory','checkins','journal')),
  granted boolean not null,
  notice_version text not null,
  source text not null check (source in ('whatsapp','simulator','admin','demo')),
  created_at timestamptz not null default now()
);
create index user_consents_user_kind_idx on user_consents (user_id, kind, created_at desc);

-- ---------------------------------------------------------- conversations
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','simulator','demo')),
  status text not null default 'active' check (status in ('active','idle','closed')),
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  message_count integer not null default 0,
  summary_enc text,
  summary_upto_seq integer not null default 0,
  model text,
  prompt_version integer,
  max_severity text not null default 'none' check (max_severity in ('none','low','moderate','high','critical')),
  had_error boolean not null default false
);
create index conversations_user_idx on conversations (user_id, last_message_at desc);
create index conversations_last_message_idx on conversations (channel, last_message_at desc);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  seq integer not null,
  direction text not null check (direction in ('inbound','outbound')),
  kind text not null check (kind in ('text','voice','template','system','unsupported')),
  content_enc text,
  wa_message_id text,
  status text not null check (status in ('received','processing','queued','sent','delivered','read','failed')),
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  model text,
  prompt_version integer,
  safety_severity text not null default 'none',
  error text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (conversation_id, seq)
);
create index messages_user_created_idx on messages (user_id, created_at);
create index messages_created_idx on messages (created_at);
create index messages_wa_idx on messages (wa_message_id) where wa_message_id is not null;

-- ----------------------------------------------------------------- memory
create table memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('name','preference','goal','style','technique','event','context')),
  content_enc text not null,
  event_date date,
  status text not null default 'active' check (status in ('active','deleted')),
  confidence real not null default 0.5,
  source_message_id uuid references messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz
);
create index memories_user_idx on memories (user_id, status);

create table memory_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  memory_id uuid references memories(id) on delete set null,
  action text not null check (action in ('created','updated','deleted','rejected','retrieved')),
  actor text not null check (actor in ('system','user','admin')),
  reason text,
  created_at timestamptz not null default now()
);
create index memory_events_created_idx on memory_events (created_at);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content_enc text not null,
  created_at timestamptz not null default now()
);
create index journal_entries_user_idx on journal_entries (user_id, created_at desc);

-- ---------------------------------------------------------------- content
create table content_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null check (category in ('sleep','meditation','breathing','music','stories','movement','focus')),
  duration_minutes integer,
  url text not null,
  language text not null default 'en',
  available boolean not null default true,
  verified boolean not null default false,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index content_items_category_idx on content_items (category) where available and verified;

create table tool_invocations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  user_id uuid not null references users(id) on delete cascade,
  tool text not null,
  input jsonb not null default '{}',
  output_summary text,
  status text not null check (status in ('ok','denied','error')),
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index tool_invocations_created_idx on tool_invocations (created_at);
create index tool_invocations_conversation_idx on tool_invocations (conversation_id);

-- --------------------------------------------------------------- check-ins
create table checkin_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('morning','evening','bedtime')),
  local_time text not null check (local_time ~ '^\d{2}:\d{2}$'),
  timezone text not null,
  frequency text not null check (frequency in ('daily','weekdays','weekly')),
  weekday smallint check (weekday between 0 and 6),
  paused boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index checkin_preferences_user_idx on checkin_preferences (user_id);

create table checkin_schedules (
  id uuid primary key default gen_random_uuid(),
  preference_id uuid not null unique references checkin_preferences(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  next_run_at timestamptz not null,
  last_run_at timestamptz
);
create index checkin_schedules_due_idx on checkin_schedules (next_run_at);

create table checkin_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  preference_id uuid not null references checkin_preferences(id) on delete cascade,
  template_name text,
  mode text not null check (mode in ('template','session','simulator')),
  status text not null check (status in ('queued','sent','delivered','read','failed','skipped')),
  wa_message_id text,
  error text,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index checkin_deliveries_created_idx on checkin_deliveries (created_at);
create index checkin_deliveries_wa_idx on checkin_deliveries (wa_message_id) where wa_message_id is not null;

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('morning','evening','bedtime','reengagement')),
  language text not null default 'en_GB',
  category text not null check (category in ('utility','marketing')),
  body text not null,
  meta_status text not null default 'draft' check (meta_status in ('draft','pending','approved','rejected','paused','unknown')),
  meta_template_id text,
  updated_at timestamptz not null default now()
);

-- -------------------------------------------------------- AI configuration
create table prompt_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  status text not null check (status in ('draft','published','archived')),
  instructions text not null,
  traits jsonb not null,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create unique index prompt_versions_one_published on prompt_versions ((status)) where status = 'published';

create table ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('safety','quality')),
  policy_version text not null,
  prompt_version integer,
  mode text not null,
  total integer not null,
  passed integer not null,
  results jsonb not null,
  created_by text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ safety
-- Data-minimised: category, severity and rule only. No message text.
create table safety_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  channel text not null,
  category text not null,
  severity text not null check (severity in ('none','low','moderate','high','critical')),
  layer text not null check (layer in ('input','output','tool')),
  rule_id text,
  action text not null check (action in ('logged','supportive','resources','replaced')),
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','confirmed','false_positive')),
  reviewed_by text,
  reviewed_at timestamptz,
  policy_version text not null,
  created_at timestamptz not null default now()
);
create index safety_events_created_idx on safety_events (created_at);

-- -------------------------------------------------------------- telemetry
create table usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  channel text not null,
  kind text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index usage_events_kind_created_idx on usage_events (kind, created_at);

create table api_costs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text,
  purpose text not null,
  channel text not null,
  conversation_id uuid references conversations(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  estimated boolean not null default true,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index api_costs_created_idx on api_costs (created_at);

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null unique,
  kind text not null,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);
create index webhook_events_created_idx on webhook_events (created_at);

-- ------------------------------------------------------------------- admin
create table admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null unique,
  name text not null,
  role text not null check (role in ('owner','admin','operator','safety_reviewer','analyst')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admin_users(id) on delete set null,
  admin_email text,
  action text not null,
  target_type text,
  target_id text,
  reason text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on admin_audit_logs (created_at desc);

create table deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  anon_id text not null,
  status text not null check (status in ('pending','completed','rejected')),
  requested_via text not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  handled_by text
);

create table settings (
  id text primary key,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by text
);

-- -------------------------------------------------------------------- jobs
create table jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','done','failed','dead')),
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  lock_key text,
  locked_by text,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_due_idx on jobs (status, run_at);
create index jobs_lock_idx on jobs (lock_key, created_at) where status in ('queued','running');

-- Claim due jobs. For each lock_key only the oldest queued job is eligible,
-- and only while no job with that key is running – so one user's messages
-- are processed strictly in order even with several workers.
create or replace function claim_jobs(p_worker text, p_limit integer, p_now timestamptz)
returns setof jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with heads as (
    select distinct on (lock_key) id
    from jobs
    where status = 'queued' and lock_key is not null
    order by lock_key, created_at
  ),
  candidates as (
    select j.id
    from jobs j
    where j.status = 'queued'
      and j.run_at <= p_now
      and (
        j.lock_key is null
        or (
          j.id in (select id from heads)
          and not exists (select 1 from jobs r where r.lock_key = j.lock_key and r.status = 'running')
        )
      )
    order by j.run_at, j.created_at
    limit p_limit
    for update skip locked
  )
  update jobs j
  set status = 'running', locked_by = p_worker, locked_at = p_now, attempts = j.attempts + 1, updated_at = p_now
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;
revoke all on function claim_jobs(text, integer, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------- retention
-- Called daily by the worker (job type "retention.sweep") with values from
-- settings; kept here too so it can be scheduled with pg_cron if preferred.
create or replace function purge_expired(p_message_days integer, p_webhook_days integer, p_job_days integer)
returns void
language sql
security definer
set search_path = public
as $$
  delete from messages where created_at < now() - make_interval(days => p_message_days);
  delete from webhook_events where created_at < now() - make_interval(days => p_webhook_days);
  delete from jobs where status in ('done','dead') and updated_at < now() - make_interval(days => p_job_days);
  update memories set status = 'deleted', content_enc = '' where expires_at is not null and expires_at < now() and status = 'active';
$$;
revoke all on function purge_expired(integer, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array[
    'users','user_preferences','user_consents','conversations','messages','memories','memory_events',
    'journal_entries','content_items','tool_invocations','checkin_preferences','checkin_schedules',
    'checkin_deliveries','message_templates','prompt_versions','ai_evaluations','safety_events',
    'usage_events','api_costs','webhook_events','admin_users','admin_audit_logs','jobs',
    'deletion_requests','settings'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

create or replace function is_active_admin(p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users a
    where a.auth_user_id = auth.uid() and a.active
      and (p_roles is null or a.role = any(p_roles))
  );
$$;

-- Signed-in staff may read non-sensitive operational tables directly
-- (e.g. for BI tools). Sensitive tables (messages, memories, journal,
-- users, consents, preferences) have no authenticated policy at all: they
-- are only reachable through the app's audited server routes.
create policy staff_read on content_items for select to authenticated using (is_active_admin());
create policy staff_read on message_templates for select to authenticated using (is_active_admin());
create policy staff_read on prompt_versions for select to authenticated using (is_active_admin());
create policy staff_read on ai_evaluations for select to authenticated using (is_active_admin());
create policy staff_read on safety_events for select to authenticated using (is_active_admin(array['owner','admin','safety_reviewer']));
create policy staff_read on api_costs for select to authenticated using (is_active_admin(array['owner','admin','analyst']));
create policy staff_read on usage_events for select to authenticated using (is_active_admin(array['owner','admin','analyst']));
create policy self_read on admin_users for select to authenticated using (auth_user_id = auth.uid());
create policy owner_read on admin_audit_logs for select to authenticated using (is_active_admin(array['owner','admin']));

insert into settings (id, data) values ('global', '{}'::jsonb) on conflict (id) do nothing;
