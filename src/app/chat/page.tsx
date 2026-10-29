import type { Metadata, Viewport } from "next";
import { ChatApp } from "./chat-app";

export const metadata: Metadata = {
  title: "Calm-1",
  description: "Calm, just a message away.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Calm-1", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#ffffff" };

export default function ChatPage() {
  return <ChatApp />;
}
