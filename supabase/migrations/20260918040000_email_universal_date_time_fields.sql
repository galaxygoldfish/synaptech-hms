-- Two new dynamic fields, available on every template regardless of
-- category: `sent_date`/`sent_time`, the date and time the email actually
-- went out. Unlike every existing field, these aren't pulled from a row —
-- sendTemplatedEmail computes them fresh at send time (see that file) — so
-- there's no per-event wiring needed, just making them selectable in the
-- editor's chip picker for every template.
--
-- Appends only what's missing, so this is safe to re-run and doesn't
-- disturb the existing field order admins already see for a template
-- (a plain array literal would have replaced the array outright and lost
-- any customization; a naive `distinct/unnest` would have re-sorted it).

update email_templates
set dynamic_fields = dynamic_fields || array(
  select field
  from unnest(array['sent_date', 'sent_time']) as field
  where not (field = any(dynamic_fields))
)
where not (dynamic_fields @> array['sent_date', 'sent_time']);
