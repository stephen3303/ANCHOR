-- Topic tags replace communities. A message carries any number of topic
-- tags, usually subtopics ("safety.electrical"); see src/lib/topics.ts.
--
-- The demo messages get their subtopic tags. Any other message keeps what it
-- had, mapped to the matching top-level topic. Only the display record
-- changes; the raw artifacts never carried tags.
WITH demo(id, topics) AS (VALUES
    ('comsublant-078-26', '["submarine.deployments", "readiness.reporting"]'::jsonb),
    ('navadmin-236-26', '["cyber.controls", "policy.admin", "readiness.inspections"]'::jsonb),
    ('navadmin-235-26', '["cyber.controls", "policy.admin"]'::jsonb),
    ('comsublant-080-26', '["safety.stand-downs", "safety.orm", "submarine"]'::jsonb),
    ('navadmin-234-26', '["readiness.force-health", "personnel.family"]'::jsonb),
    ('comsublant-061-26', '["submarine.deployments", "readiness.reporting"]'::jsonb),
    ('navadmin-228-26', '["personnel.assignments", "policy.admin"]'::jsonb),
    ('navadmin-231-26', '["training.pipeline", "training.schools"]'::jsonb),
    ('comsubfor-3500-1', '["training.watch-quals", "submarine.tactics"]'::jsonb),
    ('navseainst-4790-8', '["maintenance.availabilities", "maintenance.reporting"]'::jsonb),
    ('comsublant-074-26', '["submarine.port-visits", "logistics.port-services"]'::jsonb),
    ('stonefish-sitrep-003-26', '["operations.incidents", "safety.mishaps"]'::jsonb),
    ('lanternfish-oprep5-296-26', '["operations.status", "logistics.fuel-provisions"]'::jsonb),
    ('stonefish-casrep-26-004', '["maintenance.casualties", "logistics.parts", "readiness.reporting"]'::jsonb),
    ('lanternfish-movrep-012-26', '["operations.movement", "submarine.deployments"]'::jsonb),
    ('ironfin-logreq-007-26', '["logistics.fuel-provisions", "logistics.port-services", "submarine.port-visits"]'::jsonb),
    ('usff-2026-11', '["operations.exercises", "submarine.tactics"]'::jsonb),
    ('alnav-079-26', '["personnel.leave"]'::jsonb),
    ('alnav-071-26', '["personnel.leave"]'::jsonb),
    ('navadmin-223-26', '["policy.environmental"]'::jsonb),
    ('alnav-076-26', '["policy.records"]'::jsonb)
)
UPDATE messages m
SET record = (m.record - 'communities') || jsonb_build_object('topics', demo.topics)
FROM demo
WHERE m.id = demo.id;

WITH community(name, topic) AS (VALUES
    ('Submarine Warfare', 'submarine'),
    ('Surface Warfare', 'surface'),
    ('Aviation', 'aviation'),
    ('Cybersecurity', 'cyber'),
    ('Readiness', 'readiness'),
    ('Personnel', 'personnel'),
    ('Training & Education', 'training'),
    ('Maintenance', 'maintenance'),
    ('Safety', 'safety'),
    ('Policy', 'policy'),
    ('Expeditionary Forces', 'expeditionary')
)
UPDATE messages m
SET record = (m.record - 'communities') || jsonb_build_object('topics', COALESCE((
    SELECT jsonb_agg(DISTINCT community.topic)
    FROM jsonb_array_elements_text(m.record->'communities') AS c(name)
    JOIN community ON community.name = c.name
), '[]'::jsonb))
WHERE m.record ? 'communities';
