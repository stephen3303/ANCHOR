import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/shell";
import { UserProvider } from "@/lib/current-user";

export const metadata: Metadata = {
  title: "ANCHOR",
  description: "Authoritative Naval Communications Hub for Official Records (prototype)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <UserProvider>
          <StoreProvider>
            <AppShell>{children}</AppShell>
          </StoreProvider>
        </UserProvider>
      </body>
    </html>
  );
}
