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

export interface DashboardResponse {
  stats: DashboardStats;
  user: UserProfile;
}

export interface ActionsResponse {
  groups: ActionGroup[];
}

export type EquipmentProductType = "hardware" | "consumable";

export type EquipmentCategory =
  | "recording"
  | "modulation"
  | "tools"
  | "peripherals"
  | "computing"
  | "virtual_reality";

export interface Equipment {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  product_type: EquipmentProductType;
  category: EquipmentCategory | null;
  replacement_value: number | null;
  quantity_total: number;
  documentation_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentUnit {
  id: string;
  equipment_id: string;
  serial_number: string;
  created_at: string;
}

// An add-on links one equipment product to another *existing* equipment
// product — it never creates new equipment. `addon_type` distinguishes
// whether the linked product is optional or required at checkout.
export interface EquipmentAddon {
  id: string;
  equipment_id: string;
  addon_equipment_id: string;
  addon_type: "optional" | "required";
  created_at: string;
}

export type LoanRequestStatus = "pending" | "approved" | "denied";

// A checkout submission: the primary item plus any add-ons, bundled into
// one request that an admin approves or denies as a whole.
export interface LoanRequest {
  id: string;
  user_id: string;
  status: LoanRequestStatus;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  updated_at: string;
}

export type LoanRequestItemRole = "primary" | "optional_addon" | "required_addon";

export interface LoanRequestItem {
  id: string;
  loan_request_id: string;
  equipment_id: string;
  equipment_unit_id: string | null;
  item_role: LoanRequestItemRole;
  return_date: string | null;
  signed_agreement_path: string | null;
  created_at: string;
}

// One selected hour in the 14-day pickup availability grid.
export interface LoanRequestAvailabilitySlot {
  id: string;
  loan_request_id: string;
  available_date: string;
  available_hour: number;
  created_at: string;
}
