// The one display order for message fields in every table.
//
// The Messages page sets the order. Any other table that lists messages shows
// whichever of these fields it needs, and they always appear in this relative
// order, under these labels. Fields the Messages page does not show sit where
// they read most naturally next to it: who it went to after who it came from,
// other badges after Precedence, and Status always last.
export const MESSAGE_COLUMN_ORDER = [
  "select",
  "attachments",
  "seq",
  "subject",
  "reference",
  "from",
  "addressees",
  "dtg",
  "received",
  "released",
  "precedence",
  "priority",
  "classification",
  "due",
  "summary",
  "acknowledged",
  "workstations",
  "receipt",
  "status",
] as const;

export type MessageColumn = (typeof MESSAGE_COLUMN_ORDER)[number];

export const MESSAGE_COLUMN_LABELS: Record<MessageColumn, string> = {
  select: "Select",
  attachments: "Attachments",
  seq: "#",
  subject: "Subject",
  reference: "Reference",
  from: "From",
  addressees: "Addressees",
  dtg: "Date-Time Group",
  received: "Received",
  released: "Released",
  precedence: "Precedence",
  priority: "Priority",
  classification: "Classification",
  due: "Due",
  summary: "Summary",
  acknowledged: "Commands Acknowledged",
  workstations: "Workstations",
  receipt: "C2OIX Receipt",
  status: "Status",
};

const rank = new Map<MessageColumn, number>(MESSAGE_COLUMN_ORDER.map((c, i) => [c, i]));

/** Returns the given columns in the canonical order, whatever order they were listed in. */
export function orderMessageColumns<C extends MessageColumn>(cols: readonly C[]): C[] {
  return [...new Set(cols)].sort((a, b) => rank.get(a)! - rank.get(b)!);
}
