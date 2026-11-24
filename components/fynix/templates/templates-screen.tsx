import { CaretDown, CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Notice } from "@/components/auth/notice";
import { Panel, PanelHeader } from "@/components/kit/panel";
import { checkEmailInvariants } from "@/lib/email/invariants";
import { CATALOG, SAMPLE_INVARIANT_CONTEXT, SAMPLE_PORTAL_LINK, SAMPLES, type CatalogEntry } from "@/lib/email/samples";
import { linkRuleFor, renderEmail } from "@/lib/email/templates";

function Preview({ entry }: { readonly entry: CatalogEntry }) {
  const content = SAMPLES[entry.template];
  const mail = renderEmail(content, linkRuleFor(entry.template) === "required" ? SAMPLE_PORTAL_LINK : null);
  const result = checkEmailInvariants(content, SAMPLE_INVARIANT_CONTEXT);
  return (
    <li className="px-2.5">
      <details className="group rounded-md open:bg-tonal">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md px-3 py-3 outline-none hover:bg-navy-05 focus-visible:shadow-[inset_0_0_0_2px_var(--navy)] [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block font-semibold">{entry.title}</span>
            <span className="block text-caption text-ink-muted">{entry.when}</span>
          </span>
          <span className={`flex shrink-0 items-center gap-1 text-label font-semibold ${result.ok ? "text-green-text" : "text-red-text"}`}>
            {result.ok ? <CheckCircle aria-hidden size={16} /> : <WarningCircle aria-hidden size={16} />}
            Invariants: {result.ok ? "OK" : "not OK"}
          </span>
          <CaretDown aria-hidden size={16} className="shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-4">
          <p className="text-body">
            <span className="font-semibold text-ink-muted">Subject: </span>
            {mail.subject}
          </p>
          {result.ok ? null : (
            <Notice tone="red" compact>
              {result.problems.join(" ")}
            </Notice>
          )}
          {/* Sandboxed with no permissions: no script runs, and the page is its own origin, so nothing in the message can reach this page. */}
          <iframe title={`Preview of ${entry.title}`} sandbox="" srcDoc={mail.html} loading="lazy" className="h-[460px] w-full rounded-md bg-surface" />
        </div>
      </details>
    </li>
  );
}

/** Every email template, grouped by who receives it, with its subject, a preview of the real HTML and the result of the shared rules. Preview only: wording is not edited here. */
export function TemplatesScreen() {
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="blue" role="note">
        Wording is changed in code and reviewed. This page shows what each email looks like.
      </Notice>
      <Notice tone="blue" role="note" compact>
        The names, companies, links and numbers in the previews are samples made up for this page.
      </Notice>
      {CATALOG.map((group) => (
        <Panel key={group.audience} aria-label={group.audience}>
          <PanelHeader title={group.audience} count={group.entries.length} />
          <ul className="flex flex-col gap-1 pb-3">
            {group.entries.map((entry) => (
              <Preview key={entry.template} entry={entry} />
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
