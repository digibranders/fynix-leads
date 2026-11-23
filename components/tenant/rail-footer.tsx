import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { Hint } from "@/components/ui/hint";
import { initialsOf } from "@/lib/auth/display";
import { signOutAction } from "@/server/auth/actions";
import { cn } from "@/lib/utils";

type Props = { name: string; roleLabel: string; collapsing?: boolean };

export function TenantRailFooter({ name, roleLabel, collapsing = false }: Props) {
  return (
    <div>
      <p className={cn("px-1.5 pb-2 text-xs font-medium text-on-navy-muted", collapsing && "max-lg:sr-only")}>Signed in as</p>
      <div className={cn("flex items-center gap-2.5 rounded-md bg-on-navy-07 p-[11px] text-offwhite", collapsing && "max-lg:mx-auto max-lg:size-12 max-lg:justify-center max-lg:rounded-full max-lg:p-0")}>
        <span role="img" aria-label={`${name}, ${roleLabel}`} className="grid size-[34px] shrink-0 place-items-center rounded-full bg-peach text-[12.5px] font-semibold text-navy">
          {initialsOf(name)}
        </span>
        <span className={cn("min-w-0 flex-1", collapsing && "max-lg:hidden")}>
          <span className="block truncate text-[13.5px] leading-[17px] font-semibold">{name}</span>
          <span className="block text-[12.5px] leading-4 text-on-navy-text">{roleLabel}</span>
        </span>
        <form action={signOutAction} className={cn(collapsing && "max-lg:hidden")}>
          <Hint label="Sign out" side="right">
            <button
              type="submit"
              aria-label="Sign out"
              className="grid size-9 place-items-center rounded-full text-on-navy-text outline-offwhite transition-colors duration-(--dur-hover) hover:bg-on-navy-10 hover:text-offwhite"
            >
              <SignOut aria-hidden size={18} />
            </button>
          </Hint>
        </form>
      </div>
      {collapsing && (
        <form action={signOutAction} className="mt-2 hidden max-lg:block">
          <Hint label="Sign out" side="right">
            <button
              type="submit"
              aria-label="Sign out"
              className="mx-auto grid size-10 place-items-center rounded-full text-on-navy-text outline-offwhite transition-colors duration-(--dur-hover) hover:bg-on-navy-10 hover:text-offwhite"
            >
              <SignOut aria-hidden size={18} />
            </button>
          </Hint>
        </form>
      )}
    </div>
  );
}
