import { redirect } from "next/navigation";

/** Compatibility for old bookmarks; Drafting & Release is the only composer. */
export default function LegacyCreateMessagePage() {
  redirect("/drafting");
}
