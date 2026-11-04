"use client";

import { DemoSignIn } from "@/lib/current-user";

export default function LoginPage() {
  // A full navigation clears the previous account's router/store state and
  // lets the server render the workspace with the newly issued session cookie.
  return <DemoSignIn onSignIn={() => window.location.replace("/")} />;
}
