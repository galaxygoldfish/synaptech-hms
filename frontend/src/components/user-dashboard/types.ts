export type LoanStatus = "ACTIVE" | "DUE_SOON" | "OVERDUE";

export interface LoanSummary {
  id: string;
  itemName: string;
  imageUrl: string | null;
  returnByDate: string; // ISO date
  status: LoanStatus;
}

export type MemberIconKey = "browse" | "loans" | "documentation" | "support";

export interface MemberActionItem {
  id: string;
  label: string;
  /** Shown instead of `label` at mobile widths, e.g. "My hardware loans" -> "My loan history" */
  mobileLabel?: string;
  icon: MemberIconKey;
}
