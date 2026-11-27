import { Info } from "@phosphor-icons/react/dist/ssr";
import { QualifyingQuestionsView } from "@/components/campaigns/qualifying-questions";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { RichText } from "@/components/ui/rich-text";
import { qualifyingItemsFor } from "@/lib/qualifying-items";
import { isHtmlEmpty } from "@/lib/rich-text-view";
import type { CampaignHeader } from "@/server/domain/campaign-overview";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 shadow-[inset_0_1px_0_var(--line)] first:shadow-none @md:grid-cols-[200px_minmax(0,1fr)] @md:gap-4">
      <dt className="text-table text-ink-muted">{label}</dt>
      <dd className="text-body break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

const rich = (value: string): React.ReactNode => (isHtmlEmpty(value) ? <span className="text-ink-muted">Not set</span> : <RichText value={value} />);
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

/** The brief as stored, in the order of the set-up sheet. An admin changes it with the Edit campaign button in the campaign header. */
export function BriefView({ campaign }: { campaign: CampaignHeader }) {
  const { brief } = campaign;
  const chosen = campaign.clientContacts.find((person) => person.id === brief.primaryContactId);
  const contactPerson = chosen === undefined ? null : chosen.jobTitle === null ? chosen.name : `${chosen.name}, ${chosen.jobTitle}`;
  // Details taken before the set-up sheet had its present form. They are not asked for any more, so they show only where something was stored.
  const earlier: readonly (readonly [string, React.ReactNode])[] = [
    ["Company size", brief.companySize],
    ["Ideal customer", brief.icp],
    ["Seniority", brief.seniority],
    ["Technologies", brief.technologies.join(", ")],
    ["Budget", brief.bantBudget],
    ["Authority", brief.bantAuthority],
    ["Need", brief.bantNeed],
    ["Timeline", brief.bantTimeline],
    ["Instructions", brief.instructions],
  ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== "");
  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 text-caption text-ink-muted">
        <Info aria-hidden size={14} className="mt-px shrink-0" />
        Use Edit campaign above to change the brief. The coordinator and its agencies see it, except the contact person and the internal notes.
      </p>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Group title="Campaign">
            <Row label="Runs">{`${brief.startDate} to ${brief.endDate}`}</Row>
            <Row label="Meetings per month">{brief.monthlyTarget}</Row>
            <Row label="Meetings in total">{brief.totalTarget}</Row>
            <Row label="Contact person">{contactPerson === null ? text("") : contactPerson}</Row>
          </Group>
          <Group title="Qualification criteria">
            <Row label="Target decision-makers">{list(brief.jobTitles)}</Row>
            <Row label="Target industries">{list(brief.industries)}</Row>
            <Row label="Target geographical markets">{text(brief.geography)}</Row>
          </Group>
          <Group title="Critical qualifying questions">
            <Row label="Questions">{qualifyingItemsFor(brief.qualifyingItems, brief.qualifyingQuestions).length === 0 ? text("") : <QualifyingQuestionsView items={brief.qualifyingItems} legacyText={brief.qualifyingQuestions} />}</Row>
          </Group>
        </div>
        <Group title="Brand and service information">
          <Row label="How the client is introduced">{rich(brief.pitchIntroduction)}</Row>
          <Row label="Services">{rich(brief.pitchServices)}</Row>
          <Row label="What sets them apart">{rich(brief.pitchDifferentiator)}</Row>
          <Row label="Marketing collaterals">{rich(brief.pitchCollaterals)}</Row>
          <Row label="Case studies">{rich(brief.pitchCaseStudies)}</Row>
        </Group>
      </div>
      {/* The emails are not asked for any more; copies entered earlier still show. */}
      {brief.firstEmail.trim() === "" && brief.secondEmail.trim() === "" ? null : (
        <Group title="Email copies">
          <Row label="First email">{text(brief.firstEmail)}</Row>
          <Row label="Second email">{text(brief.secondEmail)}</Row>
        </Group>
      )}
      {earlier.length > 0 ? (
        <Group title="Earlier details">
          {earlier.map(([label, value]) => (
            <Row key={label} label={label}>
              {value}
            </Row>
          ))}
        </Group>
      ) : null}
      <Group title="For Fynix">
        <Row label="Internal notes">{brief.internalNotes === null ? text("") : text(brief.internalNotes)}</Row>
      </Group>
    </div>
  );
}
