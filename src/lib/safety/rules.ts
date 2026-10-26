/**
 * Layer 1: fast, deterministic input assessment. Rules are deliberately
 * conservative about *escalation* (mentions of sadness or stress alone are
 * not flagged) and generous about *recall* for explicit risk statements.
 */
import type { Severity } from "../db/types";

export const SAFETY_POLICY_VERSION = "safety-2026.10";

export type SafetyCategory =
  | "suicide_imminent"
  | "suicidal_ideation"
  | "self_harm"
  | "method_seeking"
  | "medical_emergency"
  | "abuse"
  | "acute_distress"
  | "diagnosis_request"
  | "medication_advice"
  | "dangerous_request";

export interface Rule {
  id: string;
  category: SafetyCategory;
  severity: Severity;
  pattern: RegExp;
  /** If any of these match the same text, the rule is ignored (negation, figures of speech). */
  unless?: RegExp[];
}

const NEG = (phrase: string) => new RegExp(`\\b(don'?t|do not|never|not|wouldn'?t|won'?t)\\s+(really\\s+)?${phrase}`, "i");

export const RULES: Rule[] = [
  // --- imminent risk: a plan, means or timeframe
  { id: "imminent.plan_timeframe", category: "suicide_imminent", severity: "critical", pattern: /\b(kill|end)(ing)?\s+(myself|my life|it all)\s+(tonight|today|now|right now|this (evening|weekend|week))\b/i },
  { id: "imminent.going_to", category: "suicide_imminent", severity: "critical", pattern: /\b(i'?m|i am)\s+(going to|gonna|about to)\s+(kill myself|end (my life|it all)|take my (own )?life)\b/i },
  { id: "imminent.means_ready", category: "suicide_imminent", severity: "critical", pattern: /\b(pills|rope|knife|blade|gun)\b.{0,40}\b(ready|in front of me|in my hand|lined up|saved up)\b/i },
  { id: "imminent.goodbye", category: "suicide_imminent", severity: "critical", pattern: /\b(this is (my )?goodbye|won'?t be (here|around) (tomorrow|much longer)|final message|last (message|time you'?ll hear from me))\b/i },
  { id: "imminent.overdose_taken", category: "medical_emergency", severity: "critical", pattern: /\b(i'?ve|i have|i)\s+(just\s+)?(taken|took|swallowed)\s+(a lot of|too many|all (of )?(my|the)|loads of|a whole)\b/i },
  // --- method seeking
  { id: "method.lethal_dose", category: "method_seeking", severity: "critical", pattern: /\b(lethal|fatal|deadly)\s+(dose|amount|overdose)\b|\bhow many\b.{0,30}\b(pills|tablets|paracetamol|ibuprofen)\b.{0,30}\b(die|kill|overdose|end it)\b/i },
  { id: "method.how_to", category: "method_seeking", severity: "critical", pattern: /\b(how (to|do i|can i)|best way to|painless way to|easiest way to)\s+(kill myself|end my life|die|commit suicide|hang myself|overdose)\b/i },
  // --- ideation
  {
    id: "ideation.want_to_die",
    category: "suicidal_ideation",
    severity: "high",
    pattern: /\b(want(ed)? to die|wish i (was|were) dead|wish i wasn'?t (here|alive)|better off (dead|without me)|kill myself|end my (own )?life|take my (own )?life|suicidal|suicide)\b/i,
    unless: [NEG("want(ed)? to die"), NEG("(feel |feeling )?suicidal"), /\b(not|never|n'?t)\b.{0,12}\b(kill myself|end my life|suicid)/i, /\b(suicide (prevention|awareness|squad)|(book|film|movie|show|song|character|article|podcast)\b.{0,40}\bsuicid)/i],
  },
  {
    id: "ideation.passive",
    category: "suicidal_ideation",
    severity: "high",
    pattern: /\b(don'?t want to (be here|exist|wake up|live)( anymore)?|no (reason|point) (to|in) (live|living|going on)|can'?t go on( like this)?|everyone would be better off|disappear forever)\b/i,
  },
  // --- self harm
  { id: "selfharm.act", category: "self_harm", severity: "high", pattern: /\b(cut(ting)?|burn(ing|ed)?|hurt(ing)?|harm(ing|ed)?)\s+myself\b|\bself[- ]?harm(ing|ed)?\b/i, unless: [NEG("(cut|hurt|harm)"), /\bhurt myself (at|playing|running|lifting|in the gym)\b/i, /\b(by accident|accidentally)\b/i] },
  // --- medical emergency
  { id: "medical.cardiac", category: "medical_emergency", severity: "critical", pattern: /\b(chest pain|crushing (pain|pressure) in my chest|heart attack|stroke|face (is )?drooping|having a seizure|unconscious|not breathing|coughing up blood)\b/i, unless: [/\b(fear|afraid|scared|worried|anxious) (of|about) (having )?a (heart attack|stroke)\b/i] },
  { id: "medical.breathing", category: "medical_emergency", severity: "high", pattern: /\b(can'?t breathe|struggling to breathe|lips (are |have gone )?blue)\b/i, unless: [/\bpanic\b/i] },
  // --- abuse / coercion
  { id: "abuse.physical", category: "abuse", severity: "high", pattern: /\b(he|she|they|my (partner|husband|wife|boyfriend|girlfriend|dad|mum|mom|father|mother|parent|carer))\s+(hits|hit|beats|beat|chokes|choked|strangled|kicks|kicked|hurts|hurt)\s+me\b/i },
  { id: "abuse.fear", category: "abuse", severity: "high", pattern: /\b(scared|afraid|terrified) (of|to go home to) my (partner|husband|wife|boyfriend|girlfriend|dad|mum|mom|father|mother)\b|\b(won'?t let me (leave|see my friends|have money)|controls (all )?my (money|phone)|threaten(s|ed) to (kill|hurt) me)\b/i },
  { id: "abuse.sexual", category: "abuse", severity: "high", pattern: /\b(forced me to|made me have sex|sexually (abused|assaulted)|raped)\b/i },
  { id: "abuse.unsafe_home", category: "abuse", severity: "high", pattern: /\b(not safe at home|unsafe at home|(don'?t|do not) feel safe (at home|with (him|her|them|my \w+))|being abused|abusive (relationship|partner))\b/i },
  // --- acute distress (supportive, not an emergency)
  { id: "distress.panic", category: "acute_distress", severity: "moderate", pattern: /\b(having a panic attack|panic attack right now|can'?t stop (shaking|crying|panicking)|heart (is )?racing and|hyperventilating)\b/i },
  { id: "distress.overwhelm", category: "acute_distress", severity: "moderate", pattern: /\b(falling apart|breaking down|can'?t cope( anymore)?|completely hopeless|so hopeless|i'?m worthless|hate myself)\b/i },
  // --- out of scope requests
  { id: "scope.diagnosis", category: "diagnosis_request", severity: "low", pattern: /\b(do i have|have i got|am i)\s+(depression|anxiety disorder|adhd|ocd|ptsd|bipolar|bpd|autism|autistic|an eating disorder|insomnia disorder)\b|\bdiagnose me\b|\bwhat('?s| is) wrong with me medically\b/i },
  { id: "scope.medication", category: "medication_advice", severity: "moderate", pattern: /\b(how (much|many)\s+(mg|milligrams|pills|tablets)|what dose|dosage of|should i (stop|start|come off|double|increase|reduce) (taking )?my (meds|medication|antidepressants|pills|sertraline|citalopram|fluoxetine|melatonin)|mix(ing)? (my )?(meds|medication|pills) with (alcohol|drink)|(sertraline|citalopram|fluoxetine|zopiclone|diazepam|xanax|melatonin)\b.{0,30}\b(dose|mg|how much|stop|alcohol)|(alcohol|drink|drinking)\b.{0,20}\b(on|with|while (on|taking))\s+(my )?(sertraline|citalopram|fluoxetine|zopiclone|diazepam|xanax|meds|medication|antidepressants))\b/i },
  { id: "scope.dangerous", category: "dangerous_request", severity: "high", pattern: /\b(how to (starve myself|stop eating|purge|make myself (sick|throw up))|pro[- ]?ana tips|hide (my )?self[- ]harm)\b/i },
];

/** Soft signals that don't escalate on their own but justify a model review. */
export const SOFT_SIGNALS = /\b(hopeless|worthless|no point|give up|giving up|can'?t do this anymore|tired of (everything|living|life)|numb|empty inside|burden|trapped|alone in this)\b/i;

export interface RuleMatch {
  ruleId: string;
  category: SafetyCategory;
  severity: Severity;
}

export function matchRules(text: string): RuleMatch[] {
  const out: RuleMatch[] = [];
  for (const r of RULES) {
    if (!r.pattern.test(text)) continue;
    if (r.unless?.some((u) => u.test(text))) continue;
    out.push({ ruleId: r.id, category: r.category, severity: r.severity });
  }
  return out;
}

const ORDER: Severity[] = ["none", "low", "moderate", "high", "critical"];
export const severityRank = (s: Severity) => ORDER.indexOf(s);
export const maxSeverity = (...s: Severity[]): Severity => s.reduce((a, b) => (severityRank(b) > severityRank(a) ? b : a), "none" as Severity);
