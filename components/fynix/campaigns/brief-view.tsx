import { Info } from "@phosphor-icons/react/dist/ssr";
import { Panel, PanelHeader } from "@/components/kit/panel";
import type { CampaignHeader } from "@/server/domain/campaign-overview";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 shadow-[inset_0_1px_0_var(--line)] first:shadow-none @md:grid-cols-[200px_minmax(0,1fr)] @md:gap-4">
      <dt className="text-table text-ink-muted">{label}</dt>
      <dd className="text-body break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

const text = (value: string): React.ReactNode => (value.trim() === "" ? <span className="text-ink-muted">Not set</span> : value);
const list = (values: readonly string[]): React.ReactNode => (values.length === 0 ? <span className="text-ink-muted">Not set</span> : values.join(", "));

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel aria-label={title}>
      <PanelHeader title={title} />
      <dl className="px-5 pb-3">{children}</dl>
    </Panel>
  );
}

/** The brief as stored. An admin changes it with the Edit campaign button in the campaign header. */
export function BriefView({ campaign }: { campaign: CampaignHeader }) {
  const { brief } = campaign;
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 text-caption text-ink-muted">
        <Info aria-hidden size={14} className="mt-px shrink-0" />
        Use Edit campaign above to change the brief. The coordinator and its agencies see it, except the internal notes.
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Group title="Dates and targets">
            <Row label="Runs">{`${brief.startDate} to ${brief.endDate}`}</Row>
            <Row label="Meetings per month">{brief.monthlyTarget}</Row>
            <Row label="Meetings in total">{brief.totalTarget}</Row>
          </Group>
          <Group title="Qualification">
            <Row label="Budget">{text(brief.bantBudget)}</Row>
            <Row label="Authority">{text(brief.bantAuthority)}</Row>
            <Row label="Need">{text(brief.bantNeed)}</Row>
            <Row label="Timeline">{text(brief.bantTimeline)}</Row>
          </Group>
          <Group title="Instructions">
            <Row label="For the agency">{text(brief.instructions)}</Row>
            <Row label="Internal notes">{brief.internalNotes === null ? text("") : text(brief.internalNotes)}</Row>
          </Group>
        </div>
        <Group title="Who to reach">
          <Row label="Geography">{text(brief.geography)}</Row>
          <Row label="Industries">{list(brief.industries)}</Row>
          <Row label="Company size">{text(brief.companySize)}</Row>
          <Row label="Ideal customer">{text(brief.icp)}</Row>
          <Row label="Job titles">{list(brief.jobTitles)}</Row>
          <Row label="Seniority">{text(brief.seniority)}</Row>
          <Row label="Technologies">{list(brief.technologies)}</Row>
        </Group>
      </div>
    </div>
  );
}
