import { MOCK_NOW } from "./format";
import type { BriefingConfig } from "./store";
import type { Community, Message } from "./types";

const RANGE_DAYS: Record<string, number> = { "Last 24 hours": 1, "Last 7 days": 7, "Last 14 days": 14, "Last 30 days": 30 };
const ORDER = { High: 0, Medium: 1, Low: 2 } as const;

/** Messages a briefing config selects, most important first. */
export function selectBriefing(messages: Message[], cfg: BriefingConfig, read: (id: string) => boolean): Message[] {
  const cutoff = MOCK_NOW.getTime() - (RANGE_DAYS[cfg.range] ?? 7) * 86_400_000;
  return messages.filter((m) => {
    if (new Date(m.received).getTime() < cutoff) return false;
    if (cfg.communities.length && !m.communities.some((c) => cfg.communities.includes(c))) return false;
    if (cfg.highOnly && m.importance !== "High") return false;
    if (cfg.actionOnly && !m.actionItem) return false;
    if (cfg.unreadOnly && read(m.id)) return false;
    if (!cfg.includeSuperseded && ["SUPERSEDED", "CANCELLED", "EXPIRED"].includes(m.lifecycle)) return false;
    return true;
  }).sort((a, b) => ORDER[a.importance] - ORDER[b.importance] || b.received.localeCompare(a.received));
}

export function topicCounts(items: Message[]): { topic: Community; n: number }[] {
  const counts = new Map<Community, number>();
  items.forEach((m) => m.communities.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1)));
  return [...counts.entries()].map(([topic, n]) => ({ topic, n })).sort((a, b) => b.n - a.n);
}
