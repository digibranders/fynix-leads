import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Fynix Leads", template: "%s | Fynix Leads" },
  description: "Lead generation tracking for Fynix campaigns.",
  robots: { index: false, follow: false },
};

/** `cover` lets the page run under the notch and the home bar, so the safe-area insets the glass chrome reads are real on an iPhone. */
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#0c1e2e" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" mobileOffset={{ bottom: "calc(var(--tabbar-stack) + 8px)", left: 14, right: 14 }} />
      </body>
    </html>
  );
}
