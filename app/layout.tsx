import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "caseForge",
  description: "AI-first QA operations for automation, execution, and reporting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased">
        {children}
      </body>
    </html>
  );
}
