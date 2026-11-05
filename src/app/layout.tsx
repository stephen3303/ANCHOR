import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ANCHOR",
  description: "Authoritative Naval Communications Hub for Official Records (prototype)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full overflow-hidden overscroll-none antialiased">
      <body className="flex h-dvh min-h-0 flex-col overflow-hidden overscroll-none">
        {children}
      </body>
    </html>
  );
}
