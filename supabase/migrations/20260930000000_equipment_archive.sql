-- Deleting a product whose equipment_id ever appeared on a loan request
-- fails outright: loan_request_items.equipment_id has no ON DELETE
-- behavior (see 20260817030000_loan_requests.sql) and, unlike
-- audit_log/inventory_audit_entries, doesn't snapshot the product name, so
-- the row can't just be nulled out without breaking "what was borrowed" on
-- old loan history. Rather than block deletion outright, the client now
-- falls back to archiving: the row stays (loan history keeps resolving its
-- name), but it's excluded from every catalog/management listing.
--
-- Nothing here needs to enforce archived_at itself — it's a plain nullable
-- timestamp, filtered client-side (see listEquipment in src/lib/inventory.ts)
-- the same way every other list/filter in this app is.

alter table equipment add column if not exists archived_at timestamptz;
