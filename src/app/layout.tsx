import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Calm-1 Admin", template: "%s · Calm-1 Admin" },
  description: "Operate, evaluate and improve Calm-1 – the AI wellbeing companion on WhatsApp.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
