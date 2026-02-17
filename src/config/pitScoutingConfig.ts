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
    label: "What is their stated shooting/intake speed?",
    placeholder: "e.g., 2 seconds per cycle",
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
  {
    id: "autonomous",
    type: "checkbox",
    label: "Autonomous capabilities",
    options: [
      "Can score in autonomous",
      "Can pick up game pieces",
      "Has complex pathing",
      "Uses vision",
      "Leaves starting zone",
    ],
  },
  {
    id: "scoring-locations",
    type: "checkbox",
    label: "Where can the robot score?",
    options: [
      "High goal",
      "Mid goal",
      "Low goal",
      "Ground pickup",
      "Human player station",
    ],
  },

  // Strategy & Design
  {
    id: "primary-strategy",
    type: "select",
    label: "Primary game strategy",
    required: true,
    options: [
      "Offense focused",
      "Defense focused",
      "Balanced",
      "Support/Cycle",
      "Specialist",
    ],
  },
  {
    id: "unique-mechanisms",
    type: "textarea",
    label: "Describe any unique mechanisms or features",
    placeholder: "What makes this robot special or different?",
    required: false,
  },

  // Team Information
  {
    id: "driver-competitions",
    type: "text",
    label: "How many competitions have your drivers driven at?",
    placeholder: "Enter number of competitions",
    required: false,
  },
  {
    id: "programming-language",
    type: "radio",
    label: "What programming language does the team use?",
    options: ["Java", "C++", "Python", "LabVIEW", "Other"],
  },
  {
    id: "experience-level",
    type: "radio",
    label: "Team experience level",
    options: ["Rookie", "2-3 years", "4-6 years", "7-10 years", "10+ years"],
  },

  // Performance & Reliability
  {
    id: "consistency-rating",
    type: "radio",
    label: "How consistent/reliable does the robot appear?",
    required: true,
    options: [
      "Very reliable",
      "Mostly reliable",
      "Average",
      "Some issues",
      "Many issues",
    ],
  },
  {
    id: "build-quality",
    type: "radio",
    label: "Overall build quality",
    required: true,
    options: ["Excellent", "Good", "Average", "Below Average", "Poor"],
  },

  // Additional Notes
  {
    id: "strengths",
    type: "textarea",
    label: "What are this robot's main strengths?",
    placeholder: "Speed, accuracy, versatility, etc.",
    required: false,
  },
  {
    id: "weaknesses",
    type: "textarea",
    label: "What are this robot's main weaknesses?",
    placeholder: "Any limitations or concerns observed",
    required: false,
  },
  {
    id: "additional-notes",
    type: "textarea",
    label: "Additional notes or observations",
    placeholder: "Any other relevant information...",
    required: false,
  },
];
