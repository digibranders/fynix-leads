import type { Metadata } from "next";
import { HostsView } from "@/components/tenant/hosts-view";
import { TenantPageHeader } from "@/components/tenant/page-header";
import { requireClient } from "@/server/client/session";
import { getDatabase } from "@/server/db/client";
import { listClientHosts, type HostHoursWindow } from "@/server/domain/hosts-tenant";

export const metadata: Metadata = { title: "Hosts & Availability" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const BLOCK = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function hoursLines(hours: readonly HostHoursWindow[]): string[] {
  return hours.map((window) => `${DAYS[window.weekday] ?? "Day"}: ${clock(window.startMinute)} to ${window.endMinute === 1440 ? "24:00" : clock(window.endMinute)}`);
}

export default async function ClientHostsPage() {
  const view = await requireClient();
  const hosts = await listClientHosts(getDatabase("leads_client").db, view.actor);
  return (
    <div className="flex flex-col gap-6">
      <TenantPageHeader title="Meeting Hosts & Availability" subtitle="The people who take your meetings, and when they are free. Fynix sets these up with you." />
      <HostsView
        hosts={hosts.map((host) => ({
          memberId: host.memberId,
          name: host.name,
          jobTitle: host.jobTitle,
          campaigns: host.campaigns,
          hoursLines: hoursLines(host.hours),
          timeZone: host.hours[0]?.timeZone ?? null,
          blockLines: host.blocks.map((block) => `${BLOCK.format(block.startsAt)} to ${BLOCK.format(block.endsAt)}${block.note === null ? "" : `, ${block.note}`}`),
        }))}
      />
    </div>
  );
}
