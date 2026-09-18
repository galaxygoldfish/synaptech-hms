-- Removed at the club's request. checkout-request-approval was always
-- dormant — the app has no separate approval step, so "Successful handoff
-- confirmation" is what a member actually receives — and it's been decided
-- there's no need to keep an inert placeholder for it in the "Manage
-- member-facing emails" list. No email_log rows reference this key (this
-- template never sent anything), so there's nothing else to clean up.

delete from email_templates where key = 'checkout-request-approval';
