// Topic tags: what a message is about, for subscriptions, search and briefings.
//
// Topics are ANCHOR's own, not part of NTP 3(J) or the system it replaces, and
// sit apart from a message's category (Operational/Administrative) and type
// (GENADMIN, CASREP...). They form a two-level tree: a topic and its
// subtopics. Messages are tagged with subtopics (a parent topic alone means
// "general" within it) and can carry any number of tags. Subscribing to a
// topic covers all of its subtopics; subscribing to a subtopic covers only it.

export interface Topic {
  /** "safety" for a topic, "safety.electrical" for a subtopic. */
  id: string;
  name: string;
}

export interface TopicGroup extends Topic {
  subtopics: Topic[];
}

const group = (id: string, name: string, subs: [string, string][]): TopicGroup => ({
  id,
  name,
  subtopics: subs.map(([sid, sname]) => ({ id: `${id}.${sid}`, name: sname })),
});

export const TOPICS: TopicGroup[] = [
  group("operations", "Operations", [
    ["movement", "Unit Movements"],
    ["status", "Unit Status Reporting"],
    ["incidents", "Incident Reporting"],
    ["exercises", "Exercises"],
  ]),
  group("submarine", "Submarine Warfare", [
    ["deployments", "Deployments & Patrols"],
    ["port-visits", "Port Visits"],
    ["tactics", "Tactics & Doctrine"],
    ["strategic", "Strategic Forces"],
  ]),
  group("surface", "Surface Warfare", [
    ["fleet-ops", "Fleet Operations"],
    ["tactics", "Tactics & Doctrine"],
    ["amphibious", "Amphibious Operations"],
  ]),
  group("aviation", "Aviation", [
    ["flight-ops", "Flight Operations"],
    ["aircraft-maintenance", "Aircraft Maintenance"],
    ["natops", "NATOPS & Standardization"],
  ]),
  group("expeditionary", "Expeditionary Forces", [
    ["eod", "Explosive Ordnance Disposal"],
    ["diving", "Diving & Salvage"],
    ["construction", "Naval Construction"],
  ]),
  group("cyber", "Cybersecurity", [
    ["controls", "Cyber Controls & Compliance"],
    ["incidents", "Cyber Incident Reporting"],
    ["training", "Cyber Awareness Training"],
    ["networks", "Network Operations"],
  ]),
  group("readiness", "Readiness", [
    ["reporting", "Readiness Reporting"],
    ["inspections", "Inspections & Certifications"],
    ["force-health", "Force Health Protection"],
    ["mobilization", "Mobilization"],
  ]),
  group("personnel", "Personnel", [
    ["leave", "Leave & Liberty"],
    ["assignments", "Assignments & Detailing"],
    ["pay", "Pay & Allowances"],
    ["advancement", "Advancement & Promotion"],
    ["awards", "Awards & Recognition"],
    ["family", "Family Support"],
  ]),
  group("training", "Training & Education", [
    ["watch-quals", "Watch Qualifications"],
    ["pipeline", "Training Pipeline"],
    ["pme", "Professional Military Education"],
    ["schools", "Schools & Courses"],
  ]),
  group("maintenance", "Maintenance", [
    ["availabilities", "Availabilities"],
    ["casualties", "Equipment Casualties"],
    ["reporting", "Maintenance Reporting"],
  ]),
  group("logistics", "Logistics", [
    ["fuel-provisions", "Fuel & Provisions"],
    ["port-services", "Port Services"],
    ["parts", "Parts & Supply"],
  ]),
  group("safety", "Safety", [
    ["electrical", "Electrical Safety"],
    ["motorcycle", "Motorcycle Safety"],
    ["hearing", "Hearing Conservation"],
    ["traffic", "Traffic Safety"],
    ["heat-stress", "Heat Stress"],
    ["heavy-weather", "Heavy Weather"],
    ["mishaps", "Afloat Mishaps"],
    ["orm", "Operational Risk Management"],
    ["stand-downs", "Safety Stand-Downs"],
  ]),
  group("policy", "Policy", [
    ["records", "Records Management"],
    ["environmental", "Environmental Compliance"],
    ["admin", "Administrative Policy"],
    ["legal", "Legal & Ethics"],
  ]),
];

const BY_ID = new Map<string, Topic & { parent?: TopicGroup }>([
  ...TOPICS.map((g) => [g.id, g] as const),
  ...TOPICS.flatMap((g) => g.subtopics.map((s) => [s.id, { ...s, parent: g }] as const)),
]);

export const isTopic = (id: string) => BY_ID.has(id);

/** The topic a tag belongs to: "safety.electrical" -> "safety"; a topic is its own parent. */
export const parentOf = (id: string) => id.split(".")[0];

/** "Electrical Safety", or the id itself when it isn't a known topic. */
export const topicName = (id: string) => BY_ID.get(id)?.name ?? id;

/** "Safety › Electrical Safety" for a subtopic, "Safety" for a topic. */
export const topicPath = (id: string) => {
  const t = BY_ID.get(id);
  return t?.parent ? `${t.parent.name} › ${t.name}` : topicName(id);
};

/** Whether a selection (topics and/or subtopics) covers a tag. A topic covers all of its subtopics. */
export const covers = (selection: string, tag: string) => selection === tag || selection === parentOf(tag);

/** Whether any of a message's tags falls under any selected topic or subtopic. */
export const matchesTopics = (tags: string[], selection: string[]) =>
  !selection.length || tags.some((t) => selection.some((s) => covers(s, t)));

/** Tags grouped under their parent topic, in tree order. */
export function groupTags(tags: string[]): { group: TopicGroup; tags: string[] }[] {
  return TOPICS.map((g) => ({ group: g, tags: tags.filter((t) => parentOf(t) === g.id) })).filter((x) => x.tags.length);
}
