import { AppShell } from "@/components/shell/app-shell";
import { SAMPLE_LEADS } from "@/lib/sample/data";

// Built here, on the server, so the shell never imports the leads: only ref, name and company reach the browser.
const SEARCH_LEADS = SAMPLE_LEADS.map((lead) => ({ ref: lead.ref, name: lead.prospect.name, company: lead.prospect.company }));

export default function PrototypeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell searchLeads={SEARCH_LEADS}>{children}</AppShell>;
}
