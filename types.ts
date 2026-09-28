export type Section = "maths" | "reasoning";

export type Attempt = {
  id: number;
  day: string; // YYYY-MM-DD
  section: Section;
  topic: string;
  questions: number;
  correct: number;
  wrong: number;
  skipped: number;
  seconds: number; // out of 900
  pace: number[]; // seconds spent on each question
  note: string | null;
};

export const SECTION_LABEL: Record<Section, string> = {
  maths: "Quantitative Aptitude",
  reasoning: "General Intelligence & Reasoning",
};

export const SECTION_SHORT: Record<Section, string> = {
  maths: "Maths",
  reasoning: "Reasoning",
};

export const BUDGET_SECONDS = 900;
export const BUDGET_QUESTIONS = 25;
/** 900s / 25 questions */
export const SECONDS_PER_QUESTION = 36;

export const TOPICS: Record<Section, string[]> = {
  maths: [
    "Percentage",
    "Profit & Loss",
    "Time & Work",
    "Ratio & Proportion",
    "Average",
    "Simple & Compound Interest",
    "Speed–Time–Distance",
    "Algebra",
    "Geometry",
    "Mensuration",
    "Trigonometry",
    "Data Interpretation",
    "Number System",
  ],
  reasoning: [
    "Analogy",
    "Classification",
    "Number & Alphabet Series",
    "Coding–Decoding",
    "Blood Relations",
    "Direction Sense",
    "Syllogism",
    "Venn Diagram",
    "Mirror & Water Image",
    "Paper Folding",
    "Dice & Cube",
    "Ranking & Order",
    "Clock & Calendar",
  ],
};
