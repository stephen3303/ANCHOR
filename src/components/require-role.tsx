"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useCurrentUser } from "@/lib/current-user";
import { hasRole, type RoleName } from "@/lib/roles";
import { Panel } from "./ui";

/** Shows the page only to holders of the role; everyone else sees which role it needs. */
export function RequireRole({ role, children }: { role: RoleName; children: ReactNode }) {
  if (hasRole(useCurrentUser(), role)) return <>{children}</>;
  return (
    <Panel title="Access restricted" icon={Lock}>
      <p className="text-sm">This page needs the <span className="font-semibold">{role}</span> role. Ask your System Admin if you need it.</p>
    </Panel>
  );
}
