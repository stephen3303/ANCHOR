-- Message types follow NTP 3(J): the type is the message identifier in the
-- MSGID set, or a general message's title. COMSUBLANT MSG, FLEET MSG and
-- SAFETY MSG were labels by originator for what is GENADMIN traffic.
--
-- Only the display record changes. The raw text in message_artifacts is the
-- official record and already says GENADMIN.
UPDATE messages
SET record = jsonb_set(record, '{type}', '"GENADMIN"')
WHERE record->>'type' IN ('COMSUBLANT MSG', 'FLEET MSG', 'SAFETY MSG');
