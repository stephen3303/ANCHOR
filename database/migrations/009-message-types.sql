-- Message types are the MSGID set's field 2, and topic types carry a subtag in
-- field 3 (MSGID/SAFETY/ELECTRICAL/...). The type is the subscription key and
-- names the template that drafts it. This replaces the earlier drafting labels
-- and free-form topic tags.
--
-- Released records (local releases, published drafts) are immutable and keep
-- whatever they were released with; the app shows an unknown type as written.

-- Received and local messages. Their raw text is the official record and says
-- GENADMIN for the old COMSUBLANT MSG / FLEET MSG / SAFETY MSG labels.
UPDATE messages
SET record = jsonb_set(record - 'topics' - 'communities', '{type}',
    CASE WHEN record->>'type' IN ('COMSUBLANT MSG', 'FLEET MSG', 'SAFETY MSG') THEN '"GENADMIN"' ELSE record->'type' END)
WHERE coalesce(record->>'kind', '') <> 'released'
  AND (record ? 'topics' OR record ? 'communities' OR record->>'type' IN ('COMSUBLANT MSG', 'FLEET MSG', 'SAFETY MSG'));

-- Drafts in progress and routing: map each old drafting label to the type its
-- workflow now matches, so chains and release scopes keep catching the same drafts.
CREATE FUNCTION pg_temp.anchor_type_009(label text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE label
        WHEN 'COMSUBLANT MSG' THEN 'GENADMIN'
        WHEN 'FLEET MSG' THEN 'LOGISTICS'
        WHEN 'SAFETY MSG' THEN 'SAFETY'
        WHEN 'COMSUBFOR INST' THEN 'GENADMIN'
        ELSE label END
$$;
CREATE FUNCTION pg_temp.anchor_types_009(list jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(jsonb_agg(DISTINCT pg_temp.anchor_type_009(value)), '[]'::jsonb)
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(list) = 'array' THEN list ELSE '[]'::jsonb END)
$$;

UPDATE outgoing_messages
SET record = jsonb_set(record - 'communities' - 'topics', '{type}', to_jsonb(pg_temp.anchor_type_009(record->>'type')))
WHERE workflow_status <> 'released'
  AND (record ? 'communities' OR record ? 'topics' OR record->>'type' <> pg_temp.anchor_type_009(record->>'type'));

UPDATE message_drafts d
SET message_type = pg_temp.anchor_type_009(d.message_type)
WHERE d.message_type <> pg_temp.anchor_type_009(d.message_type)
  AND NOT EXISTS (SELECT 1 FROM outgoing_messages o WHERE o.draft_id = d.id AND o.workflow_status = 'released');

UPDATE command_routing
SET workflows = (SELECT coalesce(jsonb_agg(
        CASE WHEN w ? 'matchTypes' THEN jsonb_set(w - 'matchOffices', '{matchTypes}', pg_temp.anchor_types_009(w->'matchTypes')) ELSE w - 'matchOffices' END
        ORDER BY position), '[]'::jsonb)
        FROM jsonb_array_elements(workflows) WITH ORDINALITY AS list(w, position)),
    authorities = (SELECT coalesce(jsonb_agg(
        CASE WHEN a ? 'scope' THEN jsonb_set(a - 'offices', '{scope}', pg_temp.anchor_types_009(a->'scope')) ELSE a - 'offices' END
        ORDER BY position), '[]'::jsonb)
        FROM jsonb_array_elements(authorities) WITH ORDINALITY AS list(a, position)),
    revision = revision + 1;

-- Standard Message: "Msg Type" becomes a pick list of every draftable type and
-- subtag. The option shows the name; its output is what MSGID fields 2 and 3
-- print (SAFETY/ELECTRICAL). New version only; old versions and pins stay.
-- Generated from DRAFT_KEYS in src/lib/message-types.ts; naval.test.ts checks
-- this list still matches.
DO $$
DECLARE parent record; previous message_template_versions%ROWTYPE; next_version integer; updated_ui jsonb;
    select_field jsonb := '{"name":"Msg Type","control":"select","required":true,"options":["MOVREP - Movement Report","LOGREQ - Logistic Requirement","OPREP-3 - Operational Report 3","OPREP-5 - Operational Report 5","CASREP - Casualty Report","INDIGO - INDIGO","OPERATIONS - Operations","OPERATIONS/MOVEMENT - Unit Movements","OPERATIONS/STATUS - Unit Status Reporting","OPERATIONS/INCIDENTS - Incident Reporting","OPERATIONS/EXERCISES - Exercises","SUBMARINE - Submarine Warfare","SUBMARINE/DEPLOYMENTS - Deployments & Patrols","SUBMARINE/PORT-VISITS - Port Visits","SUBMARINE/TACTICS - Tactics & Doctrine","SUBMARINE/STRATEGIC - Strategic Forces","SURFACE - Surface Warfare","SURFACE/FLEET-OPS - Fleet Operations","SURFACE/TACTICS - Tactics & Doctrine","SURFACE/AMPHIBIOUS - Amphibious Operations","AVIATION - Aviation","AVIATION/FLIGHT-OPS - Flight Operations","AVIATION/AIRCRAFT-MAINT - Aircraft Maintenance","AVIATION/NATOPS - NATOPS & Standardization","EXPEDITIONARY - Expeditionary Forces","EXPEDITIONARY/EOD - Explosive Ordnance Disposal","EXPEDITIONARY/DIVING - Diving & Salvage","EXPEDITIONARY/CONSTRUCTION - Naval Construction","LOGISTICS - Logistics","LOGISTICS/FUEL-PROVISIONS - Fuel & Provisions","LOGISTICS/PORT-SERVICES - Port Services","LOGISTICS/PARTS - Parts & Supply","CYBER - Cybersecurity","CYBER/CONTROLS - Cyber Controls & Compliance","CYBER/INCIDENTS - Cyber Incident Reporting","CYBER/TRAINING - Cyber Awareness Training","CYBER/NETWORKS - Network Operations","READINESS - Readiness","READINESS/REPORTING - Readiness Reporting","READINESS/INSPECTIONS - Inspections & Certifications","READINESS/FORCE-HEALTH - Force Health Protection","READINESS/MOBILIZATION - Mobilization","PERSONNEL - Personnel","PERSONNEL/LEAVE - Leave & Liberty","PERSONNEL/ASSIGNMENTS - Assignments & Detailing","PERSONNEL/PAY - Pay & Allowances","PERSONNEL/ADVANCEMENT - Advancement & Promotion","PERSONNEL/AWARDS - Awards & Recognition","PERSONNEL/FAMILY - Family Support","TRAINING - Training & Education","TRAINING/WATCH-QUALS - Watch Qualifications","TRAINING/PIPELINE - Training Pipeline","TRAINING/PME - Professional Military Education","TRAINING/SCHOOLS - Schools & Courses","MAINTENANCE - Maintenance","MAINTENANCE/AVAILABILITIES - Availabilities","MAINTENANCE/CASUALTIES - Equipment Casualties","MAINTENANCE/REPORTING - Maintenance Reporting","SAFETY - Safety","SAFETY/ELECTRICAL - Electrical Safety","SAFETY/MOTORCYCLE - Motorcycle Safety","SAFETY/HEARING - Hearing Conservation","SAFETY/TRAFFIC - Traffic Safety","SAFETY/HEAT-STRESS - Heat Stress","SAFETY/HEAVY-WEATHER - Heavy Weather","SAFETY/MISHAPS - Afloat Mishaps","SAFETY/ORM - Operational Risk Management","SAFETY/STAND-DOWNS - Safety Stand-Downs","POLICY - Policy","POLICY/RECORDS - Records Management","POLICY/ENVIRONMENTAL - Environmental Compliance","POLICY/ADMIN - Administrative Policy","POLICY/LEGAL - Legal & Ethics","GENADMIN - General Administration"],"optionOutputs":{"MOVREP - Movement Report":"MOVREP","LOGREQ - Logistic Requirement":"LOGREQ","OPREP-3 - Operational Report 3":"OPREP-3","OPREP-5 - Operational Report 5":"OPREP-5","CASREP - Casualty Report":"CASREP","INDIGO - INDIGO":"INDIGO","OPERATIONS - Operations":"OPERATIONS","OPERATIONS/MOVEMENT - Unit Movements":"OPERATIONS/MOVEMENT","OPERATIONS/STATUS - Unit Status Reporting":"OPERATIONS/STATUS","OPERATIONS/INCIDENTS - Incident Reporting":"OPERATIONS/INCIDENTS","OPERATIONS/EXERCISES - Exercises":"OPERATIONS/EXERCISES","SUBMARINE - Submarine Warfare":"SUBMARINE","SUBMARINE/DEPLOYMENTS - Deployments & Patrols":"SUBMARINE/DEPLOYMENTS","SUBMARINE/PORT-VISITS - Port Visits":"SUBMARINE/PORT-VISITS","SUBMARINE/TACTICS - Tactics & Doctrine":"SUBMARINE/TACTICS","SUBMARINE/STRATEGIC - Strategic Forces":"SUBMARINE/STRATEGIC","SURFACE - Surface Warfare":"SURFACE","SURFACE/FLEET-OPS - Fleet Operations":"SURFACE/FLEET-OPS","SURFACE/TACTICS - Tactics & Doctrine":"SURFACE/TACTICS","SURFACE/AMPHIBIOUS - Amphibious Operations":"SURFACE/AMPHIBIOUS","AVIATION - Aviation":"AVIATION","AVIATION/FLIGHT-OPS - Flight Operations":"AVIATION/FLIGHT-OPS","AVIATION/AIRCRAFT-MAINT - Aircraft Maintenance":"AVIATION/AIRCRAFT-MAINT","AVIATION/NATOPS - NATOPS & Standardization":"AVIATION/NATOPS","EXPEDITIONARY - Expeditionary Forces":"EXPEDITIONARY","EXPEDITIONARY/EOD - Explosive Ordnance Disposal":"EXPEDITIONARY/EOD","EXPEDITIONARY/DIVING - Diving & Salvage":"EXPEDITIONARY/DIVING","EXPEDITIONARY/CONSTRUCTION - Naval Construction":"EXPEDITIONARY/CONSTRUCTION","LOGISTICS - Logistics":"LOGISTICS","LOGISTICS/FUEL-PROVISIONS - Fuel & Provisions":"LOGISTICS/FUEL-PROVISIONS","LOGISTICS/PORT-SERVICES - Port Services":"LOGISTICS/PORT-SERVICES","LOGISTICS/PARTS - Parts & Supply":"LOGISTICS/PARTS","CYBER - Cybersecurity":"CYBER","CYBER/CONTROLS - Cyber Controls & Compliance":"CYBER/CONTROLS","CYBER/INCIDENTS - Cyber Incident Reporting":"CYBER/INCIDENTS","CYBER/TRAINING - Cyber Awareness Training":"CYBER/TRAINING","CYBER/NETWORKS - Network Operations":"CYBER/NETWORKS","READINESS - Readiness":"READINESS","READINESS/REPORTING - Readiness Reporting":"READINESS/REPORTING","READINESS/INSPECTIONS - Inspections & Certifications":"READINESS/INSPECTIONS","READINESS/FORCE-HEALTH - Force Health Protection":"READINESS/FORCE-HEALTH","READINESS/MOBILIZATION - Mobilization":"READINESS/MOBILIZATION","PERSONNEL - Personnel":"PERSONNEL","PERSONNEL/LEAVE - Leave & Liberty":"PERSONNEL/LEAVE","PERSONNEL/ASSIGNMENTS - Assignments & Detailing":"PERSONNEL/ASSIGNMENTS","PERSONNEL/PAY - Pay & Allowances":"PERSONNEL/PAY","PERSONNEL/ADVANCEMENT - Advancement & Promotion":"PERSONNEL/ADVANCEMENT","PERSONNEL/AWARDS - Awards & Recognition":"PERSONNEL/AWARDS","PERSONNEL/FAMILY - Family Support":"PERSONNEL/FAMILY","TRAINING - Training & Education":"TRAINING","TRAINING/WATCH-QUALS - Watch Qualifications":"TRAINING/WATCH-QUALS","TRAINING/PIPELINE - Training Pipeline":"TRAINING/PIPELINE","TRAINING/PME - Professional Military Education":"TRAINING/PME","TRAINING/SCHOOLS - Schools & Courses":"TRAINING/SCHOOLS","MAINTENANCE - Maintenance":"MAINTENANCE","MAINTENANCE/AVAILABILITIES - Availabilities":"MAINTENANCE/AVAILABILITIES","MAINTENANCE/CASUALTIES - Equipment Casualties":"MAINTENANCE/CASUALTIES","MAINTENANCE/REPORTING - Maintenance Reporting":"MAINTENANCE/REPORTING","SAFETY - Safety":"SAFETY","SAFETY/ELECTRICAL - Electrical Safety":"SAFETY/ELECTRICAL","SAFETY/MOTORCYCLE - Motorcycle Safety":"SAFETY/MOTORCYCLE","SAFETY/HEARING - Hearing Conservation":"SAFETY/HEARING","SAFETY/TRAFFIC - Traffic Safety":"SAFETY/TRAFFIC","SAFETY/HEAT-STRESS - Heat Stress":"SAFETY/HEAT-STRESS","SAFETY/HEAVY-WEATHER - Heavy Weather":"SAFETY/HEAVY-WEATHER","SAFETY/MISHAPS - Afloat Mishaps":"SAFETY/MISHAPS","SAFETY/ORM - Operational Risk Management":"SAFETY/ORM","SAFETY/STAND-DOWNS - Safety Stand-Downs":"SAFETY/STAND-DOWNS","POLICY - Policy":"POLICY","POLICY/RECORDS - Records Management":"POLICY/RECORDS","POLICY/ENVIRONMENTAL - Environmental Compliance":"POLICY/ENVIRONMENTAL","POLICY/ADMIN - Administrative Policy":"POLICY/ADMIN","POLICY/LEGAL - Legal & Ethics":"POLICY/LEGAL","GENADMIN - General Administration":"GENADMIN"}}'::jsonb;
    select_input jsonb := '{"type":"string","enum":["MOVREP - Movement Report","LOGREQ - Logistic Requirement","OPREP-3 - Operational Report 3","OPREP-5 - Operational Report 5","CASREP - Casualty Report","INDIGO - INDIGO","OPERATIONS - Operations","OPERATIONS/MOVEMENT - Unit Movements","OPERATIONS/STATUS - Unit Status Reporting","OPERATIONS/INCIDENTS - Incident Reporting","OPERATIONS/EXERCISES - Exercises","SUBMARINE - Submarine Warfare","SUBMARINE/DEPLOYMENTS - Deployments & Patrols","SUBMARINE/PORT-VISITS - Port Visits","SUBMARINE/TACTICS - Tactics & Doctrine","SUBMARINE/STRATEGIC - Strategic Forces","SURFACE - Surface Warfare","SURFACE/FLEET-OPS - Fleet Operations","SURFACE/TACTICS - Tactics & Doctrine","SURFACE/AMPHIBIOUS - Amphibious Operations","AVIATION - Aviation","AVIATION/FLIGHT-OPS - Flight Operations","AVIATION/AIRCRAFT-MAINT - Aircraft Maintenance","AVIATION/NATOPS - NATOPS & Standardization","EXPEDITIONARY - Expeditionary Forces","EXPEDITIONARY/EOD - Explosive Ordnance Disposal","EXPEDITIONARY/DIVING - Diving & Salvage","EXPEDITIONARY/CONSTRUCTION - Naval Construction","LOGISTICS - Logistics","LOGISTICS/FUEL-PROVISIONS - Fuel & Provisions","LOGISTICS/PORT-SERVICES - Port Services","LOGISTICS/PARTS - Parts & Supply","CYBER - Cybersecurity","CYBER/CONTROLS - Cyber Controls & Compliance","CYBER/INCIDENTS - Cyber Incident Reporting","CYBER/TRAINING - Cyber Awareness Training","CYBER/NETWORKS - Network Operations","READINESS - Readiness","READINESS/REPORTING - Readiness Reporting","READINESS/INSPECTIONS - Inspections & Certifications","READINESS/FORCE-HEALTH - Force Health Protection","READINESS/MOBILIZATION - Mobilization","PERSONNEL - Personnel","PERSONNEL/LEAVE - Leave & Liberty","PERSONNEL/ASSIGNMENTS - Assignments & Detailing","PERSONNEL/PAY - Pay & Allowances","PERSONNEL/ADVANCEMENT - Advancement & Promotion","PERSONNEL/AWARDS - Awards & Recognition","PERSONNEL/FAMILY - Family Support","TRAINING - Training & Education","TRAINING/WATCH-QUALS - Watch Qualifications","TRAINING/PIPELINE - Training Pipeline","TRAINING/PME - Professional Military Education","TRAINING/SCHOOLS - Schools & Courses","MAINTENANCE - Maintenance","MAINTENANCE/AVAILABILITIES - Availabilities","MAINTENANCE/CASUALTIES - Equipment Casualties","MAINTENANCE/REPORTING - Maintenance Reporting","SAFETY - Safety","SAFETY/ELECTRICAL - Electrical Safety","SAFETY/MOTORCYCLE - Motorcycle Safety","SAFETY/HEARING - Hearing Conservation","SAFETY/TRAFFIC - Traffic Safety","SAFETY/HEAT-STRESS - Heat Stress","SAFETY/HEAVY-WEATHER - Heavy Weather","SAFETY/MISHAPS - Afloat Mishaps","SAFETY/ORM - Operational Risk Management","SAFETY/STAND-DOWNS - Safety Stand-Downs","POLICY - Policy","POLICY/RECORDS - Records Management","POLICY/ENVIRONMENTAL - Environmental Compliance","POLICY/ADMIN - Administrative Policy","POLICY/LEGAL - Legal & Ethics","GENADMIN - General Administration"]}'::jsonb;
BEGIN
    FOR parent IN SELECT id FROM message_templates
        WHERE key='standard-message' OR lower(name)=lower('Standard Message')
        ORDER BY id FOR UPDATE LOOP
        SELECT * INTO previous FROM message_template_versions
            WHERE template_id=parent.id AND published_at IS NOT NULL ORDER BY version DESC LIMIT 1;
        IF NOT FOUND THEN CONTINUE; END IF;
        IF jsonb_typeof(previous.ui_schema->'fields') IS DISTINCT FROM 'array' THEN CONTINUE; END IF;
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(previous.ui_schema->'fields') field
            WHERE field->>'name'='Msg Type' AND field->>'control'='text') THEN CONTINUE; END IF;
        IF jsonb_typeof(previous.input_schema->'properties'->'Msg Type') IS DISTINCT FROM 'object' THEN CONTINUE; END IF;
        SELECT jsonb_set(previous.ui_schema,'{fields}',jsonb_agg(
            CASE WHEN field->>'name'='Msg Type' AND field->>'control'='text'
                 THEN jsonb_set(select_field,'{required}',coalesce(field->'required','true'::jsonb)) ELSE field END ORDER BY position))
            INTO updated_ui FROM jsonb_array_elements(previous.ui_schema->'fields') WITH ORDINALITY AS fields(field,position);
        SELECT coalesce(max(version),0)+1 INTO next_version FROM message_template_versions WHERE template_id=parent.id;
        INSERT INTO message_template_versions
            (template_id,version,input_schema,ui_schema,output_definition,formatting_profile,renderer_version,created_by,published_at)
        VALUES (parent.id,next_version,jsonb_set(previous.input_schema,'{properties,Msg Type}',select_input),updated_ui,
            previous.output_definition,previous.formatting_profile,previous.renderer_version,previous.created_by,now());
    END LOOP;
END $$;
