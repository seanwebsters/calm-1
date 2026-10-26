/**
 * Vetted exercise scripts. The model presents these in its own voice but
 * the timings and steps come from here, not from generation.
 */
export const BREATHING = {
  box: {
    name: "Box breathing",
    steps: ["Breathe in through your nose for 4", "Hold for 4", "Breathe out slowly for 4", "Hold for 4", "Repeat 4 rounds, going at your own pace"],
    note: "If holding feels uncomfortable, skip the holds.",
  },
  slow: {
    name: "Slow breathing",
    steps: ["Breathe in gently through your nose for 4", "Breathe out through your mouth for 6, like fogging a window", "Keep going for about a minute"],
    note: "A longer out-breath helps the body settle.",
  },
  wind_down: {
    name: "Wind-down breathing",
    steps: ["Get comfortable and let your shoulders drop", "Breathe in for 4", "Hold softly for 7 (or less if that's a stretch)", "Breathe out slowly for 8", "Repeat 3 or 4 times"],
    note: "Good just before sleep. Stop if you feel light-headed.",
  },
} as const;

export const GROUNDING = {
  five_senses: {
    name: "5-4-3-2-1",
    steps: ["Notice 5 things you can see", "4 things you can feel (feet on the floor, clothes on your skin)", "3 things you can hear", "2 things you can smell", "1 thing you can taste"],
    note: "No need to rush. Just noticing is enough.",
  },
  feet_on_floor: {
    name: "Feet on the floor",
    steps: ["Press your feet into the floor", "Notice the weight of your body in the chair or ground", "Name, quietly, where you are and what day it is", "Take one slow breath out"],
    note: "Quick and discreet – works anywhere.",
  },
  hand_on_chest: {
    name: "Hand on chest",
    steps: ["Rest a hand on your chest", "Feel it rise and fall for a few breaths", "Say to yourself: 'right now, I'm okay to pause'"],
    note: "A small, kind anchor.",
  },
} as const;

export const SLEEP = {
  wind_down: {
    name: "Wind-down routine",
    steps: ["Dim the lights and put the phone face down after this", "Write down anything still buzzing around your head", "Three rounds of slow breathing", "Let your body get heavy, from toes up to forehead"],
  },
  racing_mind: {
    name: "Racing mind",
    steps: ["Name the main worry in a few words – it can wait till morning", "Try 'cognitive shuffle': picture random, unrelated objects (an apple, a bike, a cloud…)", "If you're still awake after 20 minutes, get up and do something calm in low light"],
  },
  woke_up: {
    name: "Woke up in the night",
    steps: ["Don't check the time", "Breathe out longer than you breathe in", "Rest is still useful even if sleep is slow to come back"],
  },
  bedtime_routine: {
    name: "Building a bedtime routine",
    steps: ["Pick a consistent time to start winding down", "Same three small steps each night (e.g. tea, stretch, breathing)", "Keep the bedroom cool, dark and screen-free if you can"],
  },
} as const;

export const REFLECTION = {
  day: ["What felt good today, even something small?", "What took more energy than you expected?"],
  gratitude: ["What's one thing you're glad happened today?", "Who made today a little easier?"],
  letting_go: ["Anything you'd like to leave behind before tomorrow?", "What can wait until the morning?"],
  goals: ["What's one small thing that would make tomorrow feel good?", "What would you like more of this week?"],
} as const;
