/**
 * Region-specific support resources. Calm-1 never contacts services on a
 * user's behalf; it points people to them. Keep this list reviewed by the
 * safety owner – it is the one place phone numbers are maintained.
 */
export interface Resources {
  region: string;
  emergency: string;
  crisis: string;
  text?: string;
  medicalAdvice: string;
  abuse: string;
}

const UK: Resources = {
  region: "UK",
  emergency: "999",
  crisis: "Samaritans on 116 123 (free, any time)",
  text: "text SHOUT to 85258",
  medicalAdvice: "NHS 111",
  abuse: "the National Domestic Abuse Helpline on 0808 2000 247 (free, 24/7)",
};
const US: Resources = {
  region: "US",
  emergency: "911",
  crisis: "the 988 Suicide & Crisis Lifeline (call or text 988)",
  text: "text HOME to 741741",
  medicalAdvice: "your doctor or an urgent care clinic",
  abuse: "the National Domestic Violence Hotline on 1-800-799-7233",
};
const IE: Resources = {
  region: "IE",
  emergency: "112 or 999",
  crisis: "Samaritans on 116 123 (free, any time)",
  text: "text HELLO to 50808",
  medicalAdvice: "your GP or an out-of-hours GP service",
  abuse: "Women's Aid on 1800 341 900 or Men's Aid on 01 554 3811",
};
const AU: Resources = {
  region: "AU",
  emergency: "000",
  crisis: "Lifeline on 13 11 14",
  medicalAdvice: "healthdirect on 1800 022 222",
  abuse: "1800RESPECT (1800 737 732)",
};
const INTL: Resources = {
  region: "INTL",
  emergency: "your local emergency number",
  crisis: "a local crisis line – findahelpline.com lists free, confidential services in your country",
  medicalAdvice: "a doctor or local health service",
  abuse: "a local domestic abuse service – findahelpline.com can help you find one",
};

export function resourcesFor(countryCode: string | null | undefined): Resources {
  switch (countryCode) {
    case "44":
      return UK;
    case "1":
      return US;
    case "353":
      return IE;
    case "61":
      return AU;
    default:
      return INTL;
  }
}

export function crisisLine(r: Resources): string {
  return `If you're in immediate danger or might act on these thoughts, please call ${r.emergency} now. You can also talk to ${r.crisis}${r.text ? `, or ${r.text}` : ""}.`;
}

/** Deterministic responses used when the model is unavailable or its output fails validation. */
export function fallbackResponse(category: string, r: Resources): string {
  switch (category) {
    case "suicide_imminent":
    case "suicidal_ideation":
    case "method_seeking":
    case "self_harm":
      return `I'm really glad you told me. What you're carrying sounds heavy, and you deserve support from a real person right now.\n\n${crisisLine(r)}\n\nI'm an AI, so I can't call anyone for you, but I'm here while you reach out. Are you safe right now?`;
    case "medical_emergency":
      return `This could be a medical emergency. Please call ${r.emergency} now, or ask someone near you to call. If you can, stay where someone can reach you. I'm an AI and can't get help to you myself.`;
    case "abuse":
      return `Thank you for trusting me with this. You don't deserve to be hurt or controlled. If you're in danger right now, call ${r.emergency}. You can talk confidentially to ${r.abuse}.\n\nI'm here to listen if you want to keep talking.`;
    case "medication_advice":
      return `I can't advise on medication or doses – that really needs someone who knows your situation, like a pharmacist, your GP or ${r.medicalAdvice}. If you've taken more than you meant to, call ${r.emergency}.\n\nIs something about it worrying you? Happy to talk it through.`;
    case "diagnosis_request":
      return `I'm not able to diagnose anything – I'm an AI companion, not a clinician. A GP or ${r.medicalAdvice} is the right place to explore that. I'm happy to talk about what's been going on for you, though.`;
    case "general":
      return "Sorry, I didn't phrase that well. Just to be clear, I'm Calm-1, an AI companion, not a person or a clinician. What would be most helpful right now?";
    default:
      return `I want to make sure you get the right support. ${crisisLine(r)} I'm here if you want to keep talking.`;
  }
}
