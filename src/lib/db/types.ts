/**
 * Row types. These mirror supabase/migrations/0001_init.sql exactly.
 * Fields ending in `_enc` hold AES-GCM ciphertext (see lib/crypto.ts).
 */

export type Channel = "whatsapp" | "simulator" | "demo";
export type UserStatus = "onboarding" | "active" | "opted_out" | "deleted";
export type Severity = "none" | "low" | "moderate" | "high" | "critical";
export type AdminRole = "owner" | "admin" | "operator" | "safety_reviewer" | "analyst";

export interface UserRow {
  id: string;
  anon_id: string;
  channel: Channel;
  phone_hash: string | null;
  phone_enc: string | null;
  phone_last4: string | null;
  /** Dialling code only (e.g. "44"), used to show the right crisis resources. */
  country_code: string | null;
  /** Simulator-only label so testers can tell personas apart. Never set for real users. */
  test_label: string | null;
  language: string;
  timezone: string;
  status: UserStatus;
  onboarding_step: "new" | "awaiting_consent" | "done";
  message_count: number;
  created_at: string;
  last_active_at: string | null;
  last_inbound_at: string | null;
  deleted_at: string | null;
}

export interface UserPreferencesRow {
  id: string;
  user_id: string;
  memory_enabled: boolean;
  journal_enabled: boolean;
  voice_replies: boolean;
  conversation_style: string | null;
  updated_at: string;
}

export type ConsentKind = "privacy_notice" | "memory" | "checkins" | "journal";

export interface UserConsentRow {
  id: string;
  user_id: string;
  kind: ConsentKind;
  granted: boolean;
  notice_version: string;
  source: "whatsapp" | "simulator" | "admin" | "demo";
  created_at: string;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  channel: Channel;
  status: "active" | "idle" | "closed";
  started_at: string;
  last_message_at: string;
  message_count: number;
  summary_enc: string | null;
  summary_upto_seq: number;
  model: string | null;
  prompt_version: number | null;
  max_severity: Severity;
  had_error: boolean;
}

export type MessageStatus = "received" | "processing" | "queued" | "sent" | "delivered" | "read" | "failed";

export interface MessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  seq: number;
  direction: "inbound" | "outbound";
  kind: "text" | "voice" | "template" | "system" | "unsupported";
  content_enc: string | null;
  wa_message_id: string | null;
  status: MessageStatus;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  prompt_version: number | null;
  safety_severity: Severity;
  error: string | null;
  /** Provider timestamp for ordering inbound WhatsApp messages. */
  sent_at: string;
  created_at: string;
}

export type MemoryKind = "name" | "preference" | "goal" | "style" | "technique" | "event" | "context";

export interface MemoryRow {
  id: string;
  user_id: string;
  kind: MemoryKind;
  content_enc: string;
  /** For events: the day it happens (YYYY-MM-DD, user's timezone). */
  event_date: string | null;
  status: "active" | "deleted";
  confidence: number;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export interface MemoryEventRow {
  id: string;
  user_id: string;
  memory_id: string | null;
  action: "created" | "updated" | "deleted" | "rejected" | "retrieved";
  actor: "system" | "user" | "admin";
  reason: string | null;
  created_at: string;
}

export interface JournalEntryRow {
  id: string;
  user_id: string;
  content_enc: string;
  created_at: string;
}

export type ContentCategory = "sleep" | "meditation" | "breathing" | "music" | "stories" | "movement" | "focus";

export interface ContentItemRow {
  id: string;
  title: string;
  description: string;
  category: ContentCategory;
  duration_minutes: number | null;
  url: string;
  language: string;
  available: boolean;
  verified: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ToolInvocationRow {
  id: string;
  conversation_id: string;
  message_id: string | null;
  user_id: string;
  tool: string;
  /** Minimised input: never free text from the user. */
  input: Record<string, unknown>;
  output_summary: string | null;
  status: "ok" | "denied" | "error";
  latency_ms: number;
  created_at: string;
}

export type CheckinKind = "morning" | "evening" | "bedtime";

export interface CheckinPreferenceRow {
  id: string;
  user_id: string;
  kind: CheckinKind;
  local_time: string; // HH:MM
  timezone: string;
  frequency: "daily" | "weekdays" | "weekly";
  weekday: number | null; // 0=Sunday, for weekly
  paused: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CheckinScheduleRow {
  id: string;
  preference_id: string;
  user_id: string;
  next_run_at: string;
  last_run_at: string | null;
}

export interface CheckinDeliveryRow {
  id: string;
  user_id: string;
  preference_id: string;
  template_name: string | null;
  mode: "template" | "session" | "simulator";
  status: "queued" | "sent" | "delivered" | "read" | "failed" | "skipped";
  wa_message_id: string | null;
  error: string | null;
  scheduled_for: string;
  sent_at: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface MessageTemplateRow {
  id: string;
  name: string;
  kind: CheckinKind | "reengagement";
  language: string;
  category: "utility" | "marketing";
  body: string;
  meta_status: "draft" | "pending" | "approved" | "rejected" | "paused" | "unknown";
  meta_template_id: string | null;
  updated_at: string;
}

export interface PersonalityTraits {
  warmth: number;
  playfulness: number;
  responseLength: number;
  questionFrequency: number;
  proactivity: number;
  formality: number;
  mindfulness: number;
}

export interface PromptVersionRow {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  instructions: string;
  traits: PersonalityTraits;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
}

export interface AiEvaluationRow {
  id: string;
  kind: "safety" | "quality";
  policy_version: string;
  prompt_version: number | null;
  mode: "rules" | "rules+model";
  total: number;
  passed: number;
  results: unknown;
  created_by: string | null;
  created_at: string;
}

export interface SafetyEventRow {
  id: string;
  user_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  channel: Channel;
  category: string;
  severity: Severity;
  layer: "input" | "output" | "tool";
  rule_id: string | null;
  action: "logged" | "supportive" | "resources" | "replaced";
  review_status: "unreviewed" | "confirmed" | "false_positive";
  reviewed_by: string | null;
  reviewed_at: string | null;
  policy_version: string;
  created_at: string;
}

export interface UsageEventRow {
  id: string;
  user_id: string | null;
  channel: Channel;
  kind: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface ApiCostRow {
  id: string;
  provider: "anthropic" | "whatsapp" | "elevenlabs";
  model: string | null;
  purpose: "reply" | "memory" | "safety" | "summary" | "preview" | "eval" | "transcription";
  channel: Channel | "admin";
  conversation_id: string | null;
  user_id: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  estimated: boolean;
  latency_ms: number;
  created_at: string;
}

export interface WebhookEventRow {
  id: string;
  provider: "whatsapp";
  external_id: string;
  kind: "message" | "status" | "other";
  status: "received" | "processed" | "ignored" | "failed";
  error: string | null;
  created_at: string;
}

export interface AdminUserRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string;
  role: AdminRole;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface AdminAuditLogRow {
  id: string;
  admin_id: string | null;
  admin_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface JobRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "done" | "failed" | "dead";
  run_at: string;
  attempts: number;
  max_attempts: number;
  /** Jobs sharing a lock key run one at a time, in run_at order (per-user message sequencing). */
  lock_key: string | null;
  locked_by: string | null;
  locked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeletionRequestRow {
  id: string;
  user_id: string | null;
  anon_id: string;
  status: "pending" | "completed" | "rejected";
  requested_via: "whatsapp" | "simulator" | "admin";
  requested_at: string;
  completed_at: string | null;
  handled_by: string | null;
}

export interface SettingsRow {
  id: string;
  data: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
}

export interface Tables {
  users: UserRow;
  user_preferences: UserPreferencesRow;
  user_consents: UserConsentRow;
  conversations: ConversationRow;
  messages: MessageRow;
  memories: MemoryRow;
  memory_events: MemoryEventRow;
  journal_entries: JournalEntryRow;
  content_items: ContentItemRow;
  tool_invocations: ToolInvocationRow;
  checkin_preferences: CheckinPreferenceRow;
  checkin_schedules: CheckinScheduleRow;
  checkin_deliveries: CheckinDeliveryRow;
  message_templates: MessageTemplateRow;
  prompt_versions: PromptVersionRow;
  ai_evaluations: AiEvaluationRow;
  safety_events: SafetyEventRow;
  usage_events: UsageEventRow;
  api_costs: ApiCostRow;
  webhook_events: WebhookEventRow;
  admin_users: AdminUserRow;
  admin_audit_logs: AdminAuditLogRow;
  jobs: JobRow;
  deletion_requests: DeletionRequestRow;
  settings: SettingsRow;
}

export type TableName = keyof Tables;
