import { UserProfile } from "./types";

export type LoanStatus = "ACTIVE" | "DUE_SOON" | "OVERDUE";

export interface LoanSummary {
  id: string;
  itemName: string;
  imageUrl: string | null;
  returnByDate: string;
  status: LoanStatus;
}

export type MemberIconKey = "browse" | "loans" | "documentation" | "support";

export interface MemberActionItem {
  id: string;
  label: string;
  mobileLabel?: string;
  icon: MemberIconKey;
}

export const currentMember: UserProfile = {
  name: "Sebastian Hriscu",
  role: "MEMBER",
  email: "sebhr25@uw.edu",
  handle: "@galaxygoldfish_",
  location: "1234 Address St, Seattle, WA",
};

// The member's most relevant current loan, shown on the home screen.
// Set to `null` to preview the empty state. Flip `status` between
// "ACTIVE" (neutral/white), "DUE_SOON" (yellow), and "OVERDUE" (red,
// disables the checkout CTA) to preview each wireframe state.
export const currentLoan: LoanSummary | null = {
  id: "loan-1",
  itemName: "Muse 2",
  imageUrl: null,
  returnByDate: "2026-09-27",
  status: "ACTIVE",
};

export const memberActions: MemberActionItem[] = [
  { id: "browse-inventory", label: "Browse our inventory", icon: "browse" },
  { id: "my-hardware-loans", label: "My hardware loans", mobileLabel: "My loan history", icon: "loans" },
  { id: "view-documentation", label: "View documentation", icon: "documentation" },
  { id: "get-help-support", label: "Get help & support", icon: "support" },
];
