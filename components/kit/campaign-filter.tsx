"use client";

import { useRouter } from "next/navigation";
import { NATIVE_FIELD } from "@/components/kit/field-classes";
import { campaignChoiceGroups, type CampaignChoice } from "@/lib/campaign-status";
import { cn } from "@/lib/utils";

/**
 * The campaign filter on a leads or meetings list: a select whose options are the campaigns the viewer can see, active first and the
 * closed ones grouped below. The address for each choice is worked out by the page (`hrefFor`), so every other filter is kept.
 * `hrefs` is the address by campaign id; `allHref` clears the filter.
 */
export function CampaignFilter({
  campaigns,
  selected,
  allHref,
  hrefs,
  allLabel = "All campaigns",
  className,
}: {
  campaigns: readonly CampaignChoice[];
  selected: string | null;
  allHref: string;
  hrefs: Readonly<Record<string, string>>;
  /** The first option, which clears the filter. */
  allLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const groups = campaignChoiceGroups(campaigns);
  if (groups.length === 0) return null;
  return (
    <select
      aria-label="Campaign"
      value={selected ?? ""}
      onChange={(event) => router.push(event.target.value === "" ? allHref : (hrefs[event.target.value] ?? allHref))}
      className={cn(NATIVE_FIELD, "w-full md:w-[240px]", className)}
    >
      <option value="">{allLabel}</option>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
