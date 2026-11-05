-- The Reports page is gone (2026-11-05). Its acknowledgement status moved onto
-- Transmission & Acknowledge, and Report Viewer now grants that section.
-- Only the stored role description changes; grants stay as they are.
UPDATE users SET profile = jsonb_set(profile, '{roles}', (
  SELECT jsonb_agg(CASE WHEN r->>'name' = 'Report Viewer'
    THEN r || '{"detail":"View acknowledgement status on Transmission & Acknowledge"}'::jsonb ELSE r END ORDER BY o)
  FROM jsonb_array_elements(profile->'roles') WITH ORDINALITY AS t(r, o)))
WHERE jsonb_typeof(profile->'roles') = 'array'
  AND jsonb_array_length(profile->'roles') > 0
  AND profile->'roles' @> '[{"name":"Report Viewer"}]';
