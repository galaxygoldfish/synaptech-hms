-- What the borrower actually typed to sign their agreement.
--
-- Until now the name and date from section 9 went into the generated PDF and
-- nowhere else: buildLoanAgreementPdf drew them, the file was uploaded, and
-- the values themselves were dropped. That made them unreadable to the app —
-- the admin hand-off screen could say "they signed when they submitted" but
-- couldn't show what they signed as, short of opening the PDF.
--
-- Stored alongside signed_agreement_path, which is the other half of the same
-- record. Nullable because every row written before this migration has a PDF
-- but no columns to have filled in; the hand-off screen says so rather than
-- inventing a signature for them.

alter table loan_request_items
  add column if not exists signature_name text,
  add column if not exists signature_date date;

-- No audit trigger change needed: these are written once, by the insert that
-- creates the item, and that insert is already logged as loan_item.requested.
-- They're deliberately left out of audit_loan_item_updated's diffed field
-- list too — a signature that changed after the fact is not a thing this app
-- should quietly record as an ordinary edit.
