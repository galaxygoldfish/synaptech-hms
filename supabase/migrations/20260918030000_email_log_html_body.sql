-- The signature (and any future HTML formatting) only exists in the HTML
-- version of a sent email — body_text (20260916010000) stays plain, exactly
-- what the admin editor's segments render to, with nothing appended. For
-- the "Automated email log" to show a row exactly as it went out, it needs
-- the HTML version too.

alter table email_log add column if not exists body_html text;

comment on column email_log.body_html is
  'The HTML actually sent (segments rendered as escaped HTML + the brand signature appended at send time). Null for rows logged before this column existed, and for any future send path that stays plain-text-only.';
