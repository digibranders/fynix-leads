import { Buildings, Table, UsersThree, type Icon } from "@phosphor-icons/react";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import type { PaletteGroup } from "@/lib/shell/palette";

const GROUP_ICON: Record<PaletteGroup["key"], Icon> = { leads: Table, people: UsersThree, companies: Buildings };

/**
 * The groups of what the server found: Leads, People, Companies. Each hit opens its page; the second line says who or where. The `value` carries the
 * group and the link so two hits with the same name stay separate rows for the keyboard.
 */
export function SearchResultGroups({ groups, onOpen }: { readonly groups: readonly PaletteGroup[]; readonly onOpen: (href: string) => void }) {
  return (
    <>
      {groups.map((group) => {
        const Glyph = GROUP_ICON[group.key];
        return (
          <CommandGroup key={group.key} heading={group.heading}>
            {group.hits.map((hit) => (
              <CommandItem key={`${group.key}-${hit.href}-${hit.label}`} value={`${group.key} ${hit.href} ${hit.label}`} onSelect={() => onOpen(hit.href)}>
                <Glyph aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate font-medium">{hit.label}</span>
                  {hit.detail !== null && hit.detail !== "" ? <span className="truncate text-caption text-ink-muted">{hit.detail}</span> : null}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        );
      })}
    </>
  );
}
