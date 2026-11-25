import { PencilSimple } from "@phosphor-icons/react/dist/ssr";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { Button } from "@/components/ui/button";
import type { OrganisationContact } from "@/server/domain/organisations";
import { EditContactForm } from "../forms/contact-forms";
import { FormSheet } from "../forms/form-sheet";
import { contactVisibility } from "./contact-visibility";

const NOT_SET = "Not set";
const LINK = "rounded-xs break-all underline-offset-2 hover:underline";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-tonal px-3.5 py-3">
      <dt className="text-caption font-semibold text-ink-muted">
        {label}
        {hint === undefined ? null : <span className="font-normal"> ({hint})</span>}
      </dt>
      <dd className="text-row font-medium whitespace-pre-line text-ink">{children}</dd>
    </div>
  );
}

const orNotSet = (value: string | null): React.ReactNode => (value === null || value === "" ? <span className="font-normal text-ink-muted">{NOT_SET}</span> : value);

/**
 * The Contact panel on a client, coordinator or agency record: how to reach them, and Fynix's own notes. A coordinator or an agency is one person,
 * so it shows an email and a phone number; a client shows its website (its people are the contact people panel). Fynix only (no tenant reads these
 * columns). An admin gets Edit contact; staff read it.
 */
export function ContactPanel({ organisationId, contact, canWrite, mode }: { organisationId: string; contact: OrganisationContact; canWrite: boolean; mode?: "client" | "person" }) {
  const show = contactVisibility(contact, mode);
  return (
    <Panel aria-label="Contact">
      <PanelHeader
        title="Contact"
        action={
          canWrite ? (
            <FormSheet
              trigger={
                <Button variant="secondary" size="sm">
                  <PencilSimple aria-hidden />
                  Edit contact
                </Button>
              }
              title="Edit contact"
              description="How to reach them. Only the Fynix team sees it."
            >
              <EditContactForm organisationId={organisationId} contact={contact} show={show} />
            </FormSheet>
          ) : null
        }
      />
      <dl className="grid gap-2.5 px-5 pb-5 sm:grid-cols-2">
        {show.name ? <Row label="Contact name">{orNotSet(contact.contactName)}</Row> : null}
        {show.email ? (
          <Row label="Email">
            {contact.contactEmail === null ? (
              orNotSet(null)
            ) : (
              <a href={`mailto:${contact.contactEmail}`} className={LINK}>
                {contact.contactEmail}
              </a>
            )}
          </Row>
        ) : null}
        {show.phone ? <Row label="Phone">{orNotSet(contact.contactPhone)}</Row> : null}
        {show.website ? (
          <Row label="Website">
            {contact.website === null ? (
              orNotSet(null)
            ) : (
              <a href={contact.website} target="_blank" rel="noreferrer noopener" className={LINK}>
                {contact.website}
              </a>
            )}
          </Row>
        ) : null}
        {show.address ? <Row label="Address">{orNotSet(contact.address)}</Row> : null}
        <Row label="Notes" hint="internal, Fynix only">
          {orNotSet(contact.notes)}
        </Row>
      </dl>
    </Panel>
  );
}
