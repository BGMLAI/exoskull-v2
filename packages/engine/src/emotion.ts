/**
 * Emotion Analysis — VAD (Valence-Arousal-Dominance) + Tau Quadrant.
 *
 * Fire-and-forget: analyze user message sentiment, adjust response tone.
 * Cherry-picked from v1 (lib/iors/emotion-matrix.ts).
 *
 * Tau Quadrants:
 * - Q1 (high V, high A): excited, happy → match energy
 * - Q2 (low V, high A): stressed, angry → calm, acknowledge
 * - Q3 (low V, low A): sad, defeated → warm, supportive
 * - Q4 (high V, low A): calm, content → measured, constructive
 */

export interface EmotionState {
  valence: number; // -1 to 1 (negative to positive)
  arousal: number; // 0 to 1 (calm to excited)
  dominance: number; // 0 to 1 (submissive to dominant)
  quadrant: "Q1" | "Q2" | "Q3" | "Q4";
  label: string;
  toneGuide: string;
}

const NEGATIVE_MARKERS = [
  "nie mogę", "nie wiem", "trudno", "problem", "błąd", "kurwa", "cholera",
  "frustrated", "stuck", "angry", "sad", "can't", "failed", "broken", "help",
  "zły", "smutny", "stres", "presja", "deadline", "panika",
];

const POSITIVE_MARKERS = [
  "super", "świetnie", "działa", "udało", "dzięki", "fajnie", "wow",
  "great", "awesome", "perfect", "love", "excellent", "nice", "thanks",
  "sukces", "wygrał", "happy", "excited",
];

const HIGH_AROUSAL_MARKERS = [
  "!", "!!!", "???", "ASAP", "pilne", "urgent", "natychmiast", "szybko",
  "help", "pomóż", "ratunku", "teraz", "immediately",
];

export function analyzeEmotion(message: string): EmotionState {
  const lower = message.toLowerCase();

  // Count markers
  let negCount = 0;
  let posCount = 0;
  let arousalCount = 0;

  for (const m of NEGATIVE_MARKERS) {
    if (lower.includes(m)) negCount++;
  }
  for (const m of POSITIVE_MARKERS) {
    if (lower.includes(m)) posCount++;
  }
  for (const m of HIGH_AROUSAL_MARKERS) {
    if (message.includes(m)) arousalCount++;
  }

  // Calculate VAD
  const valence = Math.max(-1, Math.min(1, (posCount - negCount) * 0.3));
  const arousal = Math.min(1, arousalCount * 0.25 + (message.length > 200 ? 0.2 : 0));
  const dominance = message === message.toUpperCase() && message.length > 5 ? 0.8 : 0.5;

  // Determine quadrant
  let quadrant: EmotionState["quadrant"];
  let label: string;
  let toneGuide: string;

  if (valence >= 0 && arousal >= 0.4) {
    quadrant = "Q1";
    label = "excited/happy";
    toneGuide = "Match their energy. Be enthusiastic and action-oriented.";
  } else if (valence < 0 && arousal >= 0.4) {
    quadrant = "Q2";
    label = "stressed/frustrated";
    toneGuide = "Acknowledge their frustration. Be calm, solution-focused. Don't be overly cheerful.";
  } else if (valence < 0 && arousal < 0.4) {
    quadrant = "Q3";
    label = "sad/defeated";
    toneGuide = "Be warm and supportive. Offer small wins. Break problems into manageable steps.";
  } else {
    quadrant = "Q4";
    label = "calm/content";
    toneGuide = "Be measured and constructive. Focus on progress and next steps.";
  }

  return { valence, arousal, dominance, quadrant, label, toneGuide };
}

/**
 * Crisis detection — safety check for urgent situations.
 */
export function detectCrisis(message: string): { isCrisis: boolean; type?: string } {
  const lower = message.toLowerCase();

  const suicideMarkers = [
    "chcę umrzeć", "samobójstwo", "nie chcę żyć", "kill myself",
    "suicide", "end my life", "want to die", "nie mam po co żyć",
  ];

  const violenceMarkers = [
    "chcę kogoś zabić", "zabić", "want to kill", "hurt someone",
  ];

  const emergencyMarkers = [
    "wypadek", "karetka", "accident", "emergency", "911", "112",
  ];

  for (const m of suicideMarkers) {
    if (lower.includes(m)) return { isCrisis: true, type: "suicide_risk" };
  }
  for (const m of violenceMarkers) {
    if (lower.includes(m)) return { isCrisis: true, type: "violence_risk" };
  }
  for (const m of emergencyMarkers) {
    if (lower.includes(m)) return { isCrisis: true, type: "emergency" };
  }

  return { isCrisis: false };
}
