export interface DashboardStats {
  activeLoans: number;
  overdueLoans: number;
  pendingRequests: number;
  pendingReturns: number;
}

export interface UserProfile {
  name: string;
  role: "ADMINISTRATOR" | "MEMBER";
  email: string;
  handle: string;
  location: string;
}

export type IconKey =
  | "inventory"
  | "add"
  | "label"
  | "checkout"
  | "return"
  | "list"
  | "members"
  | "find-member"
  | "manage-admins"
  | "mail-member"
  | "mail-admin"
  | "mail-log";

export interface ActionItem {
  id: string;
  label: string;
  icon: IconKey;
  category: string;
}

export interface ActionGroup {
  category: string;
  items: ActionItem[];
}
