import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";

export const metadata: Metadata = { title: "Campaign activity" };

/** Every change to a campaign is already recorded in the audit log. Showing it comes in a later phase. */
export default function ActivityPage() {
  return (
    <Panel aria-label="Campaign activity">
      <EmptyState icon={ClockCounterClockwise} title="Comes in a later phase">
        Changes to this campaign are recorded already. This tab will list them.
      </EmptyState>
    </Panel>
  );
}
