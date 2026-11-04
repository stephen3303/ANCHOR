import { redirect } from "next/navigation";

// Routing & Release now lives in a tab on the Admin page.
export default function RoutingAdminRedirect() {
  redirect("/admin#routing");
}
