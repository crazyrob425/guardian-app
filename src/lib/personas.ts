// Fake-call personas (v0.10). Each persona is a complete live-caller role:
// a name, a pretext, an on-device voice profile (speech-synthesis pitch /
// rate / voice-name hints), and a branching script the live-call engine
// walks as the user talks back. Everything runs in the browser — no
// server, no API key, no cost.

export type Intent = "agree" | "distress" | "stall" | "question" | "goodbye" | "other";

export interface Persona {
  id: string;
  name: string; // shown as the caller
  relation: string;
  blurb: string; // settings one-liner
  avatar: string;
  voice: { pitch: number; rate: number; hints: string[]; neural: { voice: string; speed: number } };
  opening: string[];
  replies: Record<Intent, string[]>;
  prompts: string[]; // "are you there?" nudges
  closing: string;
}

const FEMALE_HINTS = ["samantha", "aria", "zira", "google us english", "female", "jenny", "michelle"];

export const PERSONAS: Persona[] = [
  {
    id: "mom",
    name: "Mom",
    relation: "Mother",
    blurb: "A pipe burst at home — she needs you back right now.",
    avatar: "👩",
    voice: { pitch: 0.95, rate: 1.0, hints: FEMALE_HINTS, neural: { voice: "af_heart", speed: 1.0 } },
    opening: [
      "Honey? Oh thank god you picked up. The bathroom pipe just burst, there is water everywhere, it's getting into the hallway.",
      "I can't shut it off and I don't know what to do. I need you to come home right now, please.",
    ],
    replies: {
      agree: ["Okay, hurry, please. Bring towels if you can. I'll keep the door unlocked for you.", "Thank you, sweetheart. Please hurry, the water is still coming."],
      distress: ["I know, I know, I'm scared too. Just come home, we'll deal with it together, okay?", "It's okay, baby, just get here. That's all I need."],
      stall: ["There isn't time, honey, it's really bad. Please, just come now, you can go back later.", "I wouldn't ask if it wasn't an emergency. Please come now."],
      question: ["The bathroom, upstairs. Water everywhere. I turned every knob I could find. Please just hurry home.", "At the house, honey. Please don't worry about anything else, just come."],
      goodbye: ["Okay, hurry home. I love you. Bye now."],
      other: ["Honey, I can barely hear you, just please come home now, okay?", "Just come home, sweetheart. Right now. Please."],
    },
    prompts: ["Hello? Are you still there? I need you to come home.", "Honey? Please, the water is getting worse."],
    closing: "Okay. Hurry home, I love you. Bye.",
  },
  {
    id: "bestie",
    name: "Jess",
    relation: "Best friend / roommate",
    blurb: "Your roommate: the dog is sick and she's locked out of the apartment.",
    avatar: "💅",
    voice: { pitch: 1.15, rate: 1.08, hints: FEMALE_HINTS, neural: { voice: "af_jessica", speed: 1.06 } },
    opening: [
      "Girl, finally! Okay don't freak out but Biscuit just threw up everywhere and he's shaking, and I locked myself out of the apartment.",
      "I'm literally standing in the hallway in a towel. I need you home, like, now now.",
    ],
    replies: {
      agree: ["You're the best, seriously. Hurry. I'll keep him calm till you get here.", "Okay okay, drive safe but like, fast. We're waiting."],
      distress: ["Hey, hey, breathe. He's gonna be fine, we just need you here. Come home.", "I know it's scary. Just get here, we'll take him to the vet together."],
      stall: ["Babe. Towel. Hallway. Sick dog. There is no five minutes, please just come.", "I swear I would not do this if I had any other option. Please."],
      question: ["At home! Our place. I came out to grab the package and the door just, shut. Please hurry.", "Biscuit, our apartment, the whole disaster package. Just come home."],
      goodbye: ["Okay, see you in a few. Love you, bye!"],
      other: ["I can't really talk loud, the neighbors, just come home, okay?", "Home. Now. Please and thank you."],
    },
    prompts: ["Hello?? Girl, please tell me you're coming.", "Are you there? Biscuit just whimpered again, hurry."],
    closing: "Okay, hurry. Love you, bye!",
  },
  {
    id: "sister",
    name: "Sis",
    relation: "Sister",
    blurb: "Her car died and she's stranded — she needs you to come get her.",
    avatar: "🚗",
    voice: { pitch: 1.05, rate: 1.02, hints: FEMALE_HINTS, neural: { voice: "af_sarah", speed: 1.02 } },
    opening: [
      "Hey, it's me. My car just completely died, I'm pulled over and it won't even turn over.",
      "My phone's about to die too. Can you please come get me, like right now?",
    ],
    replies: {
      agree: ["Thank you thank you. I'm by the big gas station, hazards on. Hurry but be safe.", "Okay, I'll stay in the car with the doors locked till you get here."],
      distress: ["Don't cry, I'm okay, I just need my sister. Please come.", "I'm fine, I promise, I just can't stay here alone. Come get me."],
      stall: ["It's getting dark and my battery is at like four percent. Please don't make me wait.", "I know, I'm sorry, I just really need you now."],
      question: ["Just off the highway by the gas station, you know the one. Please hurry.", "I don't know cars, it just makes a clicking sound. Please just come."],
      goodbye: ["Okay. See you soon. Love you, bye."],
      other: ["My phone is dying, just come, okay? Gas station, hazards on.", "Please just come get me. Now."],
    },
    prompts: ["Hello? Can you hear me? My battery is dying.", "Are you still there? Please hurry."],
    closing: "Okay, see you soon. Love you, bye.",
  },
  {
    id: "boss",
    name: "Dana (Manager)",
    relation: "Work manager",
    blurb: "A work emergency — she needs you at the store in twenty minutes.",
    avatar: "💼",
    voice: { pitch: 0.9, rate: 1.1, hints: FEMALE_HINTS, neural: { voice: "af_nicole", speed: 1.05 } },
    opening: [
      "Hi, it's Dana. I'm sorry to call on your night off, we've had two call-outs and the closer just walked out.",
      "I need you here within twenty minutes or we can't open tomorrow. This is urgent.",
    ],
    replies: {
      agree: ["Perfect, thank you. I'll have everything ready when you arrive. See you shortly.", "Great. Clock in as soon as you're here, I'll approve the overtime."],
      distress: ["I understand it's a lot, but you're the only one I can call. I really need you here.", "I know, I'm sorry. This one time, please. We are desperate."],
      stall: ["Twenty minutes is already generous, we're short-staffed as it is. I need a yes.", "I can't push it, the morning crew depends on this. Please come in."],
      question: ["At the store. Two call-outs and a walkout, it's a mess. Please head over now.", "I'll explain everything when you're here. Just come in, please."],
      goodbye: ["Alright, see you here shortly. Thank you."],
      other: ["I need you to head in now, please. We can talk details when you arrive.", "Please confirm you're coming in. This can't wait."],
    },
    prompts: ["Hello? I need an answer, please.", "Are you there? This is time-sensitive."],
    closing: "Alright. See you here shortly.",
  },
  {
    id: "neighbor",
    name: "Mrs. Alvarez",
    relation: "Neighbor",
    blurb: "Water is leaking through her ceiling — from your unit. She needs you home.",
    avatar: "🏠",
    voice: { pitch: 1.0, rate: 0.95, hints: FEMALE_HINTS, neural: { voice: "bf_isabella", speed: 0.95 } },
    opening: [
      "Hello dear, it's Mrs. Alvarez from downstairs. I'm so sorry to bother you, but water is coming through my ceiling, right above my kitchen.",
      "The building man says it's from your unit. You need to come home right away, dear.",
    ],
    replies: {
      agree: ["Oh thank you, dear. I'll tell the building man you're on your way. Hurry, the dripping is getting faster.", "Bless you. Come straight home, I'll be waiting by your door."],
      distress: ["Don't you worry, dear, it's not your fault. Just come home and we'll sort it out.", "It's alright, just come home quickly, that's all that matters."],
      stall: ["Dear, if it keeps dripping it will ruin everything. Please, come now.", "I wouldn't trouble you if it could wait. It can't, I'm afraid."],
      question: ["Your place, dear, the leak is from your bathroom I think. Please hurry home.", "Right here at the building. Just come home, the super is waiting too."],
      goodbye: ["Okay dear, hurry home. Goodbye now."],
      other: ["Just come home right away, dear. Please.", "Home, dear. As fast as you can."],
    },
    prompts: ["Hello dear? Are you there? The dripping is worse.", "Dear? Please say you're coming."],
    closing: "Okay dear, hurry home. Goodbye.",
  },
];

export function getPersona(id: string): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}

/** Keyword intent classification for the user's spoken replies. Pure and
 *  unit-tested — the live-call engine routes on this. */
export function classifyIntent(text: string): Intent {
  const t = ` ${text.toLowerCase()} `;
  if (/\b(bye|goodbye|gotta go|have to go|hang up)\b/.test(t)) return "goodbye";
  if (/\b(help|scared|afraid|police|hurt|attack|can't leave|cannot leave|he won't|grabbing)\b/.test(t)) return "distress";
  if (/\b(okay|ok|yes|yeah|coming|leaving|on my way|be right|i'll come|heading|right now|sure)\b/.test(t)) return "agree";
  if (/\b(wait|minute|later|hold on|busy|can't right|give me)\b/.test(t)) return "stall";
  if (/\b(what|where|who|when|why|how|which)\b/.test(t) || t.includes("?")) return "question";
  return "other";
}
