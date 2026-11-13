import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { initialsOf } from "@/lib/auth/display";
import { signOutAction } from "@/server/auth/actions";
import { cn } from "@/lib/utils";

type Props = { name: string; canWrite: boolean; collapsing?: boolean };

/** The signed-in person at the foot of the rail, with the way out. A plain form, so signing out works without client JavaScript. */
export function FynixRailFooter({ name, canWrite, collapsing = false }: Props) {
  const role = canWrite ? "Fynix admin" : "Fynix staff";
  return (
    <div>
      <p className={cn("px-1.5 pb-2 text-xs font-medium text-on-navy-muted", collapsing && "max-lg:sr-only")}>Signed in as</p>
      <div className={cn("flex items-center gap-2.5 rounded-md bg-on-navy-07 p-[11px] text-offwhite", collapsing && "max-lg:mx-auto max-lg:size-12 max-lg:justify-center max-lg:rounded-full max-lg:p-0")}>
        <span role="img" aria-label={`${name}, ${role}`} className="grid size-[34px] shrink-0 place-items-center rounded-full bg-peach text-[12.5px] font-semibold text-navy">
          {initialsOf(name)}
        </span>
        <span className={cn("min-w-0 flex-1", collapsing && "max-lg:hidden")}>
          <span className="block truncate text-[13.5px] leading-[17px] font-semibold">{name}</span>
          <span className="block text-[12.5px] leading-4 text-on-navy-text">{role}</span>
        </span>
        <form action={signOutAction} className={cn(collapsing && "max-lg:hidden")}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="grid size-9 place-items-center rounded-full text-on-navy-text outline-offwhite transition-colors duration-(--dur-hover) hover:bg-on-navy-10 hover:text-offwhite"
          >
            <SignOut aria-hidden size={18} />
          </button>
        </form>
      </div>
      {collapsing && (
        <form action={signOutAction} className="mt-2 hidden max-lg:block">
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="mx-auto grid size-10 place-items-center rounded-full text-on-navy-text outline-offwhite transition-colors duration-(--dur-hover) hover:bg-on-navy-10 hover:text-offwhite"
          >
            <SignOut aria-hidden size={18} />
          </button>
        </form>
      )}
    </div>
  );
}
