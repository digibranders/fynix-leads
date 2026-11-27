"use client";

import { CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { useActionState } from "react";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { When } from "@/components/kit/when";
import { Button, buttonVariants } from "@/components/ui/button";
import { IDLE_FORM } from "@/lib/fynix/form-state";
import { disconnectCalendarAction } from "@/server/calendar/actions";

export type ConnectionView = { readonly provider: "google" | "microsoft"; readonly status: "connected" | "broken"; readonly lastSyncedAt: string | null };

const NAME = { google: "Google calendar", microsoft: "Outlook or Microsoft 365 calendar" } as const;
const OUTCOME = {
  connected: "Your calendar is connected.",
  declined: "Nothing was connected. You can try again whenever you like.",
  failed: "The calendar could not be connected. Try again.",
} as const;

function Row({ provider, connection }: { readonly provider: "google" | "microsoft"; readonly connection: ConnectionView | undefined }) {
  const [state, action, pending] = useActionState(disconnectCalendarAction, IDLE_FORM);
  const connectHref = `/api/calendar/connect/${provider}`;
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-row font-semibold">{NAME[provider]}</p>
          <p className="text-label text-ink-muted">
            {connection === undefined ? "Not connected" : connection.status === "broken" ? "Needs to be connected again" : "Connected"}
            {connection?.status === "connected" && connection.lastSyncedAt !== null ? (
              <>
                {". Last read "}
                <When at={connection.lastSyncedAt} />
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connection === undefined || connection.status === "broken" ? (
            // A plain link: signing in happens on the provider's own page, so this leaves the app.
            <a href={connectHref} className={buttonVariants({ variant: "default", size: "sm" })}>
              {connection === undefined ? "Connect" : "Connect again"}
            </a>
          ) : null}
          {connection === undefined ? null : (
            <form action={action}>
              <input type="hidden" name="provider" value={provider} />
              <Button type="submit" size="sm" variant="secondary" disabled={pending}>
                {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : null}
                Disconnect
              </Button>
            </form>
          )}
        </div>
      </div>
      {state.status === "error" ? (
        <p role="alert" className="flex items-start gap-2 text-label font-semibold text-red-text">
          <WarningCircle aria-hidden size={16} weight="fill" className="mt-px shrink-0" />
          {state.message ?? "That could not be saved. Try again."}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Connect calendar, on the profile page of a client person, only while calendar connection is on. The person signs in at Google or Microsoft, never here. Everyone
 * else sees when they are busy and never what a meeting is; the person sees their own events with titles on their own calendar page.
 */
export function CalendarConnections({ providers, connections, outcome }: { readonly providers: readonly ("google" | "microsoft")[]; readonly connections: readonly ConnectionView[]; readonly outcome?: string }) {
  if (providers.length === 0) return null;
  const known = outcome === "connected" || outcome === "declined" || outcome === "failed" ? outcome : null;
  return (
    <Panel aria-label="Calendar connection">
      <PanelHeader title="Connect your calendar" />
      <div className="flex flex-col gap-1 px-5 pb-4">
        <p className="text-body text-ink-2">Your free times then stay right on their own. Your colleagues and the agencies see only when you are busy, never what a meeting is. You can disconnect at any time.</p>
        {known === null ? null : (
          <p role="status" className={`text-label font-semibold ${known === "connected" ? "text-green-text" : "text-red-text"}`}>
            {OUTCOME[known]}
          </p>
        )}
        <ul className="divide-y divide-line">
          {providers.map((provider) => (
            <Row key={provider} provider={provider} connection={connections.find((item) => item.provider === provider)} />
          ))}
        </ul>
      </div>
    </Panel>
  );
}
