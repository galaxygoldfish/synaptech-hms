-- The "Automated email log" screen needs to show what was actually sent,
-- not just that something was sent. email_log (20260906000000) records the
-- template key, recipient, subject and status — enough for an audit count,
-- but not enough to answer "what did this member actually receive?".
--
-- Adds the rendered body and the archive CC to each row. Both are nullable:
-- rows written before this migration genuinely don't have the data, and the
-- log screen says "not recorded" for them rather than showing a blank that
-- could be mistaken for an empty email.

alter table email_log add column if not exists body_text text;
alter table email_log add column if not exists cc_email text;

-- The log is read newest-first and filtered by status in the UI.
create index if not exists email_log_status_idx on email_log (status);

comment on column email_log.body_text is
  'The rendered plain-text body as sent, after dynamic fields were substituted. Null for rows logged before this column existed.';
comment on column email_log.cc_email is
  'Archive address copied on the send, if any. Null for rows logged before this column existed.';

-- The existing "Admins view email log" select policy and the
-- `grant select on email_log to authenticated` from 20260906000000 still
-- apply and already cover the new columns; nothing to re-grant.
--
-- No insert policy: only the Edge Functions write here, and they use the
-- service role key, which bypasses RLS.
