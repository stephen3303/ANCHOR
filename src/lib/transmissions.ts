import type { Precedence } from "./types";

/** One entry in the command's transmission queue or log. */
export interface Transmission {
  id: string;
  kind: "release" | "acknowledgement";
  /** The released outgoing message, or the received message being acknowledged. */
  messageId: string;
  reference: string;
  subject: string;
  precedence: Precedence;
  body: string;
  status: "queued" | "transmitted" | "cancelled";
  queuedAt: string;
  queuedBy: string;
  queuedByName: string;
  closedAt?: string;
  closedByName?: string;
  note: string;
  /** Who released it, for release entries still able to be withdrawn. */
  releasedBy?: string;
}
