export const REJECTION_REASONS = [
  { code: "not_icp", label: "Company outside the target profile" },
  { code: "wrong_seniority", label: "Prospect not senior enough" },
  { code: "no_need", label: "No real need or project" },
  { code: "no_budget", label: "No budget this year" },
  { code: "existing_customer", label: "Already a customer or in talks" },
  { code: "duplicate", label: "Duplicate of an earlier lead" },
  { code: "bad_data", label: "Contact details wrong or unreachable" },
  { code: "other", label: "Other (explain in the note)" },
] as const;

export type RejectionReasonCode = (typeof REJECTION_REASONS)[number]["code"];
