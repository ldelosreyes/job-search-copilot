-- Reasons now live in the application's general notes field. Preserve any
-- existing reason before removing the legacy key from the JSONB status value.
update applications
set
  notes = case
    when nullif(btrim(status ->> 'reason'), '') is null then notes
    when nullif(btrim(notes), '') is null then btrim(status ->> 'reason')
    else notes || E'\n\n' || btrim(status ->> 'reason')
  end,
  status = status - 'reason',
  updated_at = now()
where status ? 'reason';
