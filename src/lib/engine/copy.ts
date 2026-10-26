/** Fixed copy for onboarding, commands and service messages. */

export const WELCOME = `Hey, I'm Calm-1 👋

I'm an AI wellbeing companion from Calm. You can message me whenever you want to talk, unwind, or take a moment for yourself.

Before we start, here's how your information is handled:
• I'm an AI, not a person, therapist or emergency service.
• Your messages are encrypted and used to reply to you. They're never sold or used to train AI models.
• Messages are deleted automatically after {retention} days. Memory is off unless you turn it on.
• Say HELP any time for options, or DELETE MY DATA to erase everything.

Reply *1* to start, or *2* to start with memory on (I'll remember helpful things like your name or a big day coming up – you can see or delete them any time).`;

export const AFTER_CONSENT_MEMORY_OFF = "Thanks. Memory is off – you can switch it on any time by saying MEMORY ON.\n\nWhat's on your mind today?";
export const AFTER_CONSENT_MEMORY_ON = "Thanks. Memory is on – say MEMORY any time to see what I remember, or MEMORY OFF to stop.\n\nWhat's on your mind today?";
export const CONSENT_REMINDER = "Before we chat, I need a quick yes. Reply *1* to start, or *2* to start with memory on. If you'd rather not, reply STOP.";
export const DECLINED = "No problem – I won't store anything else. If you change your mind, just send START.";

export const HELP = `Here's what you can say any time:
• MEMORY – see what I remember · MEMORY ON / MEMORY OFF
• FORGET 2 – forget one thing · FORGET ALL – forget everything
• JOURNAL – your last journal entries
• CHECK-INS – your check-ins · PAUSE CHECK-INS · STOP CHECK-INS
• EXPORT – get a copy of your data
• DELETE MY DATA – erase everything
• STOP – stop Calm-1 entirely

I'm an AI companion, not a therapist or emergency service. If you're in danger, please contact your local emergency number.`;

export const STOPPED = "You've stopped Calm-1. I won't send you any more messages, including check-ins. Your data is kept for {retention} days unless you send DELETE MY DATA. Send START to come back any time.";
export const STOPPED_REMINDER = "Calm-1 is stopped for this number. Send START to begin again, or DELETE MY DATA to erase everything.";
export const RESTARTED = "Welcome back.";

export const DELETE_CONFIRM = "This will permanently erase your messages, memories, journal and check-ins. It can't be undone.\n\nTo go ahead, reply *CONFIRM DELETE*.";
export const DELETED = "Done – everything has been erased. If you message again, we'll start fresh. Take care of yourself.";

export const MEMORY_DISABLED_NOTE = "Memory is off, so I'm not remembering anything between chats. Say MEMORY ON if you'd like me to.";
export const MEMORY_ON = "Memory is on. I'll remember helpful things like your name, what helps you and upcoming events. Say MEMORY to see them, FORGET to remove one.";
export const MEMORY_OFF = "Memory is off – I'll stop using and saving memories. Anything already saved stays until you say FORGET ALL.";

export const RATE_LIMITED = "You're sending messages faster than I can keep up with. Give me a moment and try again.";
export const DAILY_LIMIT = "I've reached my limit of replies for today, so I need to pause until tomorrow. If you need support now, please reach out to someone you trust or a local helpline.";
export const UNAVAILABLE = "Sorry – I can't reply properly right now. Please try again in a little while. If you need urgent support, contact your local emergency number.";
export const UNSUPPORTED_MEDIA = "I can only read text and voice notes at the moment. Could you tell me in a message?";
export const VOICE_UNAVAILABLE = "I can't listen to voice notes just yet – could you type it instead?";
