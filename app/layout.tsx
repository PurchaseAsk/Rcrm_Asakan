import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReadyPlanet CRM",
  description: "CRM for Facebook leads, pipelines, teams, and recall workflows.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
