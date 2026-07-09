import { supabase } from "../../lib/supabase";
import type { LoanStatus, LoanSummary } from "./types";

// Loan is shown on the member home screen only while the equipment is
// actually in the member's hands (checked out, overdue, or pending return).
const OPEN_LOAN_STATUSES = ["active", "overdue", "pending_return"] as const;

// A loan due within this many days (and not yet overdue) is flagged DUE_SOON.
const DUE_SOON_WINDOW_DAYS = 3;

interface LoanRow {
  id: string;
  status: string;
  due_date: string | null;
  equipment_units: {
    equipment: {
      name: string;
      image_url: string | null;
    } | null;
  } | null;
}

function toLoanStatus(dbStatus: string, dueDate: string | null): LoanStatus {
  if (dbStatus === "overdue") return "OVERDUE";
  if (dueDate) {
    const daysRemaining = (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysRemaining < 0) return "OVERDUE";
    if (daysRemaining <= DUE_SOON_WINDOW_DAYS) return "DUE_SOON";
  }
  return "ACTIVE";
}

function toLoanSummary(row: LoanRow): LoanSummary {
  return {
    id: row.id,
    itemName: row.equipment_units?.equipment?.name ?? "Unknown item",
    imageUrl: row.equipment_units?.equipment?.image_url ?? null,
    returnByDate: row.due_date ?? "",
    status: toLoanStatus(row.status, row.due_date),
  };
}

// Fetches the member's current loan (the one most worth surfacing on the
// home screen): the overdue one if there is one, otherwise the one due
// soonest. Returns null if the member has no equipment checked out.
export async function fetchCurrentLoan(memberId: string): Promise<LoanSummary | null> {
  const { data, error } = await supabase
    .from("loans")
    .select("id, status, due_date, equipment_units ( equipment ( name, image_url ) )")
    .eq("member_id", memberId)
    .in("status", OPEN_LOAN_STATUSES)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const rows = data as unknown as LoanRow[];
  const overdue = rows.find((row) => row.status === "overdue");
  return toLoanSummary(overdue ?? rows[0]);
}
