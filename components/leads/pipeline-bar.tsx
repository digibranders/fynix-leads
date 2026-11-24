import { StageBar } from "@/components/kit/stage-bar";
import { leadsHref } from "@/lib/leads/href";
import { countByGroup, PIPELINE_GROUPS, type PipelineKey } from "@/lib/leads/pipeline";

/** The stage bar of a leads screen: counts from the leads themselves, each chip a link that sets `?stage=` and keeps the search. */
export function PipelineBar({
  leads,
  basePath,
  group,
  q,
}: {
  leads: readonly { readonly stage: string }[];
  basePath: string;
  group: PipelineKey | null;
  q: string;
}) {
  const counts = countByGroup(leads);
  return (
    <StageBar
      allHref={leadsHref(basePath, { q })}
      allCount={leads.length}
      allActive={group === null}
      segments={PIPELINE_GROUPS.map((entry) => ({
        key: entry.key,
        label: entry.label,
        count: counts[entry.key],
        color: entry.color,
        href: leadsHref(basePath, { stage: entry.key, q }),
        active: group === entry.key,
      }))}
    />
  );
}
