"use client";

import { FileText } from "@phosphor-icons/react";
import { useState } from "react";
import { Tonal } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/ui/rich-text";
import { qualifyingItemsFor } from "@/lib/qualifying-items";
import { isHtmlEmpty } from "@/lib/rich-text-view";
import { QualifyingQuestionsView } from "./qualifying-questions";
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

/** A long answer written in the rich text editor. Shown only when it has something in it. */
function RichLine({ label, value }: { readonly label: string; readonly value: string }) {
  if (isHtmlEmpty(value)) return null;
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-caption font-semibold text-ink-muted">{label}</dt>
      <dd className="text-table text-ink">
        <RichText value={value} />
      </dd>
    </div>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <Tonal className="flex flex-col gap-2.5">
      <h3 className="text-label font-semibold text-ink">{title}</h3>
      <dl className="flex flex-col gap-2.5">{children}</dl>
    </Tonal>
  );
}

/** The campaign brief in a dialog: who to reach, how a lead is qualified, and Fynix's instructions. Read only. */
export function CampaignBriefButton({ name, brief }: { readonly name: string; readonly brief: CampaignBrief }) {
  const [open, setOpen] = useState(false);
  const empty =
    [
      brief.geography, brief.companySize, brief.icp, brief.seniority, brief.bantBudget, brief.bantAuthority, brief.bantNeed, brief.bantTimeline, brief.instructions,
      brief.pitchIntroduction, brief.pitchServices, brief.pitchDifferentiator, brief.pitchCollaterals, brief.pitchCaseStudies, brief.qualifyingQuestions, brief.firstEmail, brief.secondEmail,
    ].every((value) => value.trim() === "") &&
    brief.industries.length + brief.jobTitles.length + brief.technologies.length + brief.qualifyingItems.length === 0;
  // A section with nothing in it is left out, so the brief shows what Fynix wrote and no empty headings (new campaigns have no budget, authority, need or timeline answers).
  const filled = (...values: readonly string[]) => values.some((value) => !isHtmlEmpty(value));
  const hasQualification = filled(brief.bantBudget, brief.bantAuthority, brief.bantNeed, brief.bantTimeline);
  const hasBrand = filled(brief.pitchIntroduction, brief.pitchServices, brief.pitchDifferentiator, brief.pitchCollaterals, brief.pitchCaseStudies);
  const hasQuestions = qualifyingItemsFor(brief.qualifyingItems, brief.qualifyingQuestions).length > 0;
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <FileText aria-hidden weight="bold" />
        View brief
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] gap-4 overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{name}: brief</DialogTitle>
            <DialogDescription>What this campaign looks for and how a lead is qualified. Fynix keeps it up to date.</DialogDescription>
          </DialogHeader>
          {empty ? (
            <Tonal>
              <p className="text-table text-ink-2">Fynix has not written the brief for this campaign yet.</p>
            </Tonal>
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
              {hasQualification ? (
                <Section title="Qualification">
                  <Line label="Budget" value={brief.bantBudget} />
                  <Line label="Authority" value={brief.bantAuthority} />
                  <Line label="Need" value={brief.bantNeed} />
                  <Line label="Timeline" value={brief.bantTimeline} />
                </Section>
              ) : null}
              {hasBrand ? (
                <Section title="Brand and service information">
                  <RichLine label="How the client is introduced" value={brief.pitchIntroduction} />
                  <RichLine label="Services" value={brief.pitchServices} />
                  <RichLine label="What sets them apart" value={brief.pitchDifferentiator} />
                  <RichLine label="Marketing collaterals" value={brief.pitchCollaterals} />
                  <RichLine label="Case studies" value={brief.pitchCaseStudies} />
                </Section>
              ) : null}
              {hasQuestions ? (
                <Section title="Critical qualifying questions">
                  <div>
                    <QualifyingQuestionsView items={brief.qualifyingItems} legacyText={brief.qualifyingQuestions} />
                  </div>
                </Section>
              ) : null}
              {brief.firstEmail.trim() === "" && brief.secondEmail.trim() === "" ? null : (
                <Section title="Email copies">
                  <Line label="First email" value={brief.firstEmail} />
                  <Line label="Second email" value={brief.secondEmail} />
                </Section>
              )}
              {brief.instructions.trim() === "" ? null : (
                <Section title="Instructions">
                  <Line label="From Fynix" value={brief.instructions} />
                </Section>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
