import { ActionGroup, DashboardStats, UserProfile } from "./types";

export const stats: DashboardStats = {
  activeLoans: 15,
  overdueLoans: 1,
  pendingRequests: 5,
  pendingReturns: 3,
};

export const currentUser: UserProfile = {
  name: "Sebastian Hriscu",
  role: "ADMINISTRATOR",
  email: "sebhr25@uw.edu",
  handle: "@galaxygoldfish_",
  location: "1234 Address St, Seattle, WA",
};

export const actionGroups: ActionGroup[] = [
  {
    category: "Inventory",
    items: [
      { id: "manage-inventory", label: "Manage hardware inventory", icon: "inventory", category: "Inventory" },
      { id: "add-item", label: "Add a new item", icon: "add", category: "Inventory" },
      { id: "get-labels", label: "Get hardware labels", icon: "label", category: "Inventory" },
    ],
  },
  {
    category: "Hardware loans",
    items: [
      { id: "checkout-hardware", label: "Check out hardware", icon: "checkout", category: "Hardware loans" },
      { id: "return-hardware", label: "Return hardware", icon: "return", category: "Hardware loans" },
      { id: "view-loans", label: "View hardware loans", icon: "list", category: "Hardware loans" },
    ],
  },
  {
    category: "Members",
    items: [
      { id: "view-members", label: "View all registered members", icon: "members", category: "Members" },
      { id: "find-member", label: "Find a member", icon: "find-member", category: "Members" },
      { id: "manage-admins", label: "Manage administrators", icon: "manage-admins", category: "Members" },
    ],
  },
  {
    category: "Notifications",
    items: [
      { id: "configure-member-emails", label: "Configure member emails", icon: "mail-member", category: "Notifications" },
      { id: "configure-admin-emails", label: "Configure admin emails", icon: "mail-admin", category: "Notifications" },
      { id: "automated-email-log", label: "Automated email log", icon: "mail-log", category: "Notifications" },
    ],
  },
];
