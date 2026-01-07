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
    id: "drivetrain",
    type: "radio",
    label: "What type of drivetrain does the robot have?",
    required: true,
    options: ["Swerve", "Mecanum", "Tank", "West Coast", "Other"],
  },
  {
    id: "weight",
    type: "text",
    label: "Robot weight (lbs)",
    placeholder: "Enter weight in pounds",
    required: false,
  },
  {
    id: "dimensions",
    type: "text",
    label: "Robot dimensions (L x W x H in inches)",
    placeholder: "e.g., 28 x 32 x 24",
    required: false,
  },

  // Capabilities
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
  {
    id: "climb-capability",
    type: "radio",
    label: "Can the robot climb/hang?",
    required: true,
    options: ["Yes", "No", "In Development"],
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
