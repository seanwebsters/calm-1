/**
 * Deterministic user controls. These never go through the model so privacy
 * actions (stop, forget, delete) are reliable and instant.
 */
export type Command =
  | { type: "stop" }
  | { type: "start" }
  | { type: "help" }
  | { type: "memory_list" }
  | { type: "memory_on" }
  | { type: "memory_off" }
  | { type: "forget"; index: number }
  | { type: "forget_all" }
  | { type: "journal" }
  | { type: "checkins_list" }
  | { type: "checkins_pause" }
  | { type: "checkins_resume" }
  | { type: "checkins_stop" }
  | { type: "export" }
  | { type: "delete_request" }
  | { type: "delete_confirm" };

export function parseCommand(raw: string): Command | null {
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ");
  if (["stop", "unsubscribe", "stop all", "opt out", "optout"].includes(t)) return { type: "stop" };
  if (["start", "unstop", "resume calm-1", "restart"].includes(t)) return { type: "start" };
  if (["help", "menu", "options", "commands"].includes(t)) return { type: "help" };
  if (["memory", "memories", "my memories", "what do you remember", "what do you remember about me", "what do you know about me"].includes(t)) return { type: "memory_list" };
  if (["memory on", "turn memory on", "enable memory", "remember me"].includes(t)) return { type: "memory_on" };
  if (["memory off", "turn memory off", "disable memory", "stop remembering"].includes(t)) return { type: "memory_off" };
  if (["forget all", "forget everything", "delete my memories", "forget all memories"].includes(t)) return { type: "forget_all" };
  const f = /^forget (?:#|number |memory )?(\d{1,2})$/.exec(t);
  if (f) return { type: "forget", index: Number(f[1]) };
  if (["journal", "my journal", "show journal", "show my journal"].includes(t)) return { type: "journal" };
  if (["check-ins", "checkins", "check ins", "my check-ins", "my checkins"].includes(t)) return { type: "checkins_list" };
  if (["pause check-ins", "pause checkins", "pause check ins"].includes(t)) return { type: "checkins_pause" };
  if (["resume check-ins", "resume checkins", "resume check ins", "unpause check-ins"].includes(t)) return { type: "checkins_resume" };
  if (["stop check-ins", "stop checkins", "stop check ins", "no more check-ins", "turn off check-ins", "turn off checkins"].includes(t)) return { type: "checkins_stop" };
  if (["export", "export my data", "download my data", "send me my data"].includes(t)) return { type: "export" };
  if (["delete my data", "delete everything", "delete my account", "erase my data"].includes(t)) return { type: "delete_request" };
  if (t === "confirm delete") return { type: "delete_confirm" };
  return null;
}

/** Onboarding answers. */
export function parseConsentReply(raw: string): "basic" | "memory" | "decline" | null {
  const t = raw.trim().toLowerCase().replace(/[.!*]+/g, "");
  if (["1", "yes", "y", "ok", "okay", "start", "sure", "yep", "yeah", "agree", "i agree", "continue"].includes(t)) return "basic";
  if (["2", "yes memory", "2 memory", "memory", "yes with memory", "memory on"].includes(t)) return "memory";
  if (["no", "n", "stop", "no thanks", "decline"].includes(t)) return "decline";
  return null;
}
