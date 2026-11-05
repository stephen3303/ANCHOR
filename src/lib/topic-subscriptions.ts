"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isPendingTopic, type MessageTopic } from "./message-topics";

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load message subscriptions.");
  return data;
}

/** One instance per signed-in store; no local/demo subscription fallback. */
export function useTopicSubscriptions(offline: boolean) {
  const [messageTopics, setMessageTopics] = useState<MessageTopic[]>([]);
  const [topicsLoaded, setTopicsLoaded] = useState(false);
  const [topicsError, setTopicsError] = useState("");
  const [pendingTopic, setPendingTopic] = useState<string | null>(null);
  const pending = useRef(false);
  const messageTopicsRef = useRef<MessageTopic[]>([]);
  useEffect(() => { messageTopicsRef.current = messageTopics; }, [messageTopics]);
  const version = useRef(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  const refreshTopics = useCallback(async () => {
    if (offline || pending.current) return;
    const current = ++version.current;
    try {
      const data = await request("/api/subscriptions");
      if (!Array.isArray(data.topics)) throw new Error("The server returned an invalid subscription catalog.");
      if (live.current && current === version.current) {
        setMessageTopics(data.topics); setTopicsLoaded(true); setTopicsError("");
      }
    } catch (error) {
      if (live.current && current === version.current) setTopicsError(error instanceof Error ? error.message : "Subscriptions unavailable.");
    }
  }, [offline]);

  const setTopicSubscription = useCallback(async (id: string, subscribed: boolean) => {
    if (pending.current) return;
    if (offline) { setTopicsError("Connect to the server to change subscriptions."); return; }
    pending.current = true;
    ++version.current; // A stale catalog fetch must not undo a saved preference.
    setPendingTopic(id); setTopicsError("");
    try {
      // A template's Type with no messages yet is subscribed by name, which creates its topic.
      const name = isPendingTopic(id) ? messageTopicsRef.current.find((topic) => topic.id === id)?.name : undefined;
      const data = name !== undefined ? await request("/api/subscriptions", "POST", { name }) : await request(`/api/subscriptions/${id}`, subscribed ? "PUT" : "DELETE");
      const match = data.previousId ?? data.id;
      if (live.current) setMessageTopics((all) => all.map((topic) => topic.id === match ? { ...topic, id: data.id, subscribed: data.subscribed } : topic));
    } catch (error) {
      if (live.current) setTopicsError(error instanceof Error ? error.message : "Subscription was not saved.");
    } finally {
      ++version.current;
      pending.current = false;
      if (live.current) setPendingTopic(null);
    }
  }, [offline]);

  return useMemo(() => ({ messageTopics, topicsLoaded, topicsError, pendingTopic, refreshTopics, setTopicSubscription }), [messageTopics, topicsLoaded, topicsError, pendingTopic, refreshTopics, setTopicSubscription]);
}
export type TopicSubscriptionState = ReturnType<typeof useTopicSubscriptions>;
