import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pairly | Better, together",
  description: "A private place for couples to discover, talk, and stay close.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
