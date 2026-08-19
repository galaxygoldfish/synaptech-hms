-- Adds an item category to `equipment`. Only hardware products have one
-- (enforced app-side, same as replacement_value/documentation_url) —
-- consumables leave it null since "consumable" is effectively their
-- category already.

alter table equipment add column if not exists category text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'equipment_category_check'
  ) then
    alter table equipment
      add constraint equipment_category_check
      check (category in ('recording', 'modulation', 'tools', 'peripherals', 'computing', 'virtual_reality'));
  end if;
end $$;
