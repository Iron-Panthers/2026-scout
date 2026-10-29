export interface PitScoutingQuestion {
  id: string;
  type: "text" | "textarea" | "radio" | "checkbox" | "select";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  /** Only asked when an earlier question's answer passes `test` (e.g. only for modular robots). */
  askIf?: { questionId: string; test: (answer: unknown) => boolean };
  /** Asked as `label` instead when an earlier question's answer passes `test`. */
  labelIf?: { questionId: string; test: (answer: unknown) => boolean; label: string };
}

/** Pseudo-field id for the robot photo in a targeted rescout. */
export const PIT_PHOTO_FIELD = "photo";

const MODULAR_HEIGHT = "Modular (mechanism can change height)";
// The height question; older submissions saved it as a list
const isModular = (answer: unknown) => [answer].flat().includes(MODULAR_HEIGHT);

export const pitScoutingQuestions: PitScoutingQuestion[] = [
  // Robot Specifications
  {
    id: "weight",
    type: "text",
    label: "How heavy is your robot (with bumpers)?",
    placeholder: "Enter weight in pounds",
    required: true,
  },
  {
    id: "dimensions",
    type: "text",
    label: "What are your drivebase dimensions?",
    placeholder: "e.g., 28 x 32 x 22 inches (L x W x H)",
    required: true,
  },
  {
    id: "drivetrain",
    type: "radio",
    label: "What type of drivetrain does the robot have?",
    required: true,
    options: ["Swerve", "Mecanum", "Tank", "Other"],
  },
  {
    id: "terrain-capability",
    type: "radio",
    label: "Is your robot:",
    required: true,
    options: [
      "Short (can go under trench)",
      "Tall (can only go over bump)",
      MODULAR_HEIGHT,
      "Have a stretchy net (Has a net that can stretch above the height of the trench)",
    ],
  },
  {
    id: "hopper-space",
    type: "text",
    label: "What is their hopper space?",
    placeholder: "Describe hopper capacity/space",
    required: true,
    labelIf: { questionId: "terrain-capability", test: isModular, label: "What is their hopper space when lowered?" },
  },
  {
    id: "hopper-space-raised",
    type: "text",
    label: "What is their hopper space when raised?",
    placeholder: "Describe hopper capacity/space",
    required: true,
    askIf: { questionId: "terrain-capability", test: isModular },
  },
  {
    id: "shooting-intake-speed",
    type: "text",
    label: "What is their shooting speed (shots per second)?",
    placeholder: "e.g., 2.5",
    required: true,
  },
  {
    id: "shooting-method",
    type: "checkbox",
    label: "What is their shooting mechanism?",
    options: [
      "Turret",
      "Drum shooter",
      "Other/None"
    ],
    required: true,
  },

  // Capabilities
  {
    id: "climb-levels",
    type: "checkbox",
    label: "If you can climb, what levels can you climb on?",
    required: true,
    options: [
      "Level 1",
      "Level 2",
      "Level 3",
      "Cannot climb",
    ],
  },

  // Team Information
  {
    id: "driver-competitions",
    type: "text",
    label: "How many competitions have your drivers driven at (years is fine if they're not sure)?",
    placeholder: "Enter number of competitions",
    required: true,
  },

  // Autonomous
  {
    id: "auto-paths",
    type: "textarea",
    label: "Describe your auto paths",
    placeholder: "Include field elements, # of passes... be as specific as possible",
    required: true,
  },

  // Additional Notes
  {
    id: "additional-notes",
    type: "textarea",
    label: "Miscellaneous notes or fun facts?",
    placeholder: "Blah blah blah blah...",
    required: false,
  },
];

/** Whether a question is asked, given the answers so far. */
export const isQuestionAsked = (question: PitScoutingQuestion, answers: Record<string, unknown>) =>
  !question.askIf || question.askIf.test(answers[question.askIf.questionId]);

/** A question's wording, given the answers so far. */
export const questionLabel = (question: PitScoutingQuestion, answers: Record<string, unknown>) =>
  question.labelIf?.test(answers[question.labelIf.questionId]) ? question.labelIf.label : question.label;

/** The answers without any to questions that aren't asked any more (say, after the robot stopped being modular). */
export function withoutUnaskedAnswers<T extends Record<string, unknown>>(answers: T): T {
  const result: Record<string, unknown> = { ...answers };
  for (const question of pitScoutingQuestions) {
    if (!isQuestionAsked(question, answers)) delete result[question.id];
  }
  return result as T;
}
