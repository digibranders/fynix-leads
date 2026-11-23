"use client";

import { FileText } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CampaignBrief } from "@/server/domain/campaigns-tenant";

function Line({ label, value }: { readonly label: string; readonly value: string | readonly string[] }) {
  const text = typeof value === "string" ? value : value.join(", ");
  if (text.trim() === "") return null;
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-caption font-semibold text-ink-muted">{label}</dt>
      <dd className="text-table whitespace-pre-wrap text-ink">{text}</dd>
    </div>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 rounded-md bg-navy-04 p-4">
      <h3 className="text-label font-semibold text-ink">{title}</h3>
      <dl className="flex flex-col gap-2.5">{children}</dl>
    </section>
  );
}

/** The campaign brief in a dialog: who to reach, how a lead is qualified, and Fynix's instructions. Read only. */
export function CampaignBriefButton({ name, brief }: { readonly name: string; readonly brief: CampaignBrief }) {
  const [open, setOpen] = useState(false);
  const empty = [brief.geography, brief.companySize, brief.icp, brief.seniority, brief.bantBudget, brief.bantAuthority, brief.bantNeed, brief.bantTimeline, brief.instructions].every((value) => value.trim() === "") && brief.industries.length + brief.jobTitles.length + brief.technologies.length === 0;
  return (
    <>
      <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <FileText aria-hidden size={14} weight="bold" />
        View brief
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] max-w-xl gap-4 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{name}: brief</DialogTitle>
            <DialogDescription>What this campaign looks for and how a lead is qualified. Fynix keeps it up to date.</DialogDescription>
          </DialogHeader>
          {empty ? (
            <p className="rounded-md bg-navy-04 p-4 text-table text-ink-2">Fynix has not written the brief for this campaign yet.</p>
          ) : (
            <>
              <Section title="Who to reach">
                <Line label="Geography" value={brief.geography} />
                <Line label="Industries" value={brief.industries} />
                <Line label="Company size" value={brief.companySize} />
                <Line label="Job titles" value={brief.jobTitles} />
                <Line label="Seniority" value={brief.seniority} />
                <Line label="Technologies" value={brief.technologies} />
                <Line label="Ideal customer" value={brief.icp} />
              </Section>
              <Section title="Qualification">
                <Line label="Budget" value={brief.bantBudget} />
                <Line label="Authority" value={brief.bantAuthority} />
                <Line label="Need" value={brief.bantNeed} />
                <Line label="Timeline" value={brief.bantTimeline} />
              </Section>
              <Section title="Instructions">
                <Line label="From Fynix" value={brief.instructions} />
              </Section>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
