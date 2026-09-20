-- Lets the "Synaptech" row in the admin editor's Recipients section
-- (EditEmailTemplate.tsx) turn the fixed archive CC (synaptechuw@gmail.com,
-- or the EMAIL_ARCHIVE_CC secret — see sendTemplatedEmail.ts) on or off per
-- template, rather than it applying unconditionally to every send.
-- Defaults to true so nothing changes for a template until an admin
-- explicitly turns it off.

alter table email_templates add column if not exists archive_cc_enabled boolean not null default true;
