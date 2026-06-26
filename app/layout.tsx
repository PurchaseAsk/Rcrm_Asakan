import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "./sw-register";

export const metadata: Metadata = {
  title: "AsakanLeadFlow",
  description: "CRM สำหรับจัดการลีด Facebook และสื่อสารกับลูกค้า",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LeadFlow",
  },
  icons: {
    icon: [
      { url: "/icons/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/icon-180x180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className="font-sans antialiased">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
