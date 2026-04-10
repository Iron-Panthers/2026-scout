export interface PitScoutingQuestion {
  id: string;
  type: "text" | "textarea" | "radio" | "checkbox" | "select";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

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
    id: "hopper-space",
    type: "text",
    label: "What is their hopper space?",
    placeholder: "Describe hopper capacity/space",
    required: true,
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
  {
    id: "outpost-interaction",
    type: "text",
    label: "How comfortable are your drivers with pushing fuel into the outpost?",
    required: true,
    placeholder: "e.g., Very comfortable, Somewhat comfortable, Not comfortable",
  },
  {
    id: "terrain-capability",
    type: "checkbox",
    label: "Which field elements can you go through?",
    required: true,
    options: [
      "Can go over bump",
      "Can go under trench",
      "Cannot do either"
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
    required: true,
  },
];
