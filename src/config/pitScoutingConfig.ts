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
    placeholder: "e.g., 28 x 32 inches (L x W)",
    required: true,
  },
  {
    id: "drivetrain",
    type: "radio",
    label: "What type of drivetrain does the robot have?",
    required: true,
    options: ["Swerve", "Mecanum", "Tank", "West Coast", "Other"],
  },
  {
    id: "hopper-space",
    type: "text",
    label: "What is their hopper space?",
    placeholder: "Describe hopper capacity/space",
    required: false,
  },
  {
    id: "shooting-intake-speed",
    type: "text",
    label: "What is their stated shooting/intake speed (shots per second)?",
    placeholder: "e.g., 2.5",
    required: false,
  },

  // Capabilities
  {
    id: "climb-levels",
    type: "checkbox",
    label: "If you can climb, what levels can you climb on?",
    options: [
      "Level 1",
      "Level 2",
      "Level 3",
      "Level 4",
      "Cannot climb",
    ],
  },
  {
    id: "outpost-interaction",
    type: "radio",
    label: "Do they interact with outpost?",
    required: true,
    options: ["Yes", "No"],
  },
  {
    id: "terrain-capability",
    type: "checkbox",
    label: "Can you go over the bump and/or trench?",
    options: [
      "Can go over bump",
      "Can go over trench",
    ],
  },

  // Team Information
  {
    id: "driver-competitions",
    type: "text",
    label: "How many competitions have your drivers driven at?",
    placeholder: "Enter number of competitions",
    required: false,
  },

  // Additional Notes
  {
    id: "additional-notes",
    type: "textarea",
    label: "Additional notes or observations",
    placeholder: "Any other relevant information...",
    required: false,
  },
];
