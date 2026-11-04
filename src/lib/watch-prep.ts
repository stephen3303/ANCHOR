import type { Message, MessageUserState } from "./types";

export const HOUR = 3_600_000;
export const isCurrent = (m: Message) => !["SUPERSEDED", "CANCELLED", "EXPIRED"].includes(m.lifecycle);
export const needsAck = (m: Message, state: Record<string, MessageUserState>, ownSource?: string) =>
  isCurrent(m) && (!ownSource || m.source !== ownSource) && m.ackRequired && !state[m.id]?.acknowledgedAt;

export function screeningMessages(messages: Message[], start: number, end: number) {
  return messages.filter((m) => Date.parse(m.received) >= start && Date.parse(m.received) <= end)
    .sort((a, b) => Date.parse(b.received) - Date.parse(a.received));
}

export function watchDeadlines(messages: Message[], state: Record<string, MessageUserState>, asOf: number, ownSource?: string) {
  return messages.filter(isCurrent).flatMap((m) => {
    const items: { message: Message; kind: string; due: number; owner: string; dateOnly: boolean }[] = [];
    if (needsAck(m, state, ownSource) && m.ackDue) items.push({ message: m, kind: "Acknowledgement", due: Date.parse(m.ackDue), owner: "Current recipient", dateOnly: false });
    if (m.actionItem) {
      // Legacy action suspenses are date-only. Use end of UTC day and disclose the assumption.
      const match = /^(\d{2}) ([A-Z]{3}) (\d{4})$/.exec(m.actionItem.suspense);
      const month = match ? ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(match[2]) : -1;
      if (match && month >= 0) items.push({ message: m, kind: m.actionItem.text, due: Date.UTC(+match[3], month, +match[1], 23, 59, 59), owner: m.actionItem.assignedTo, dateOnly: true });
    }
    return items;
  }).filter((d) => Number.isFinite(d.due) && d.due <= asOf + 24 * HOUR)
    .sort((a, b) => a.due - b.due);
}
