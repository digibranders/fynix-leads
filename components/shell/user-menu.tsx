import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { Hint } from "@/components/ui/hint";
import { initialsOf } from "@/lib/auth/display";
import { signOutAction } from "@/server/auth/actions";

/** The signed-in person at the foot of the sidebar, with sign-out. A server component: the action posts straight from the form. */
export function UserMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
  return (
    <div className="sb-user flex items-center gap-2.5 rounded-sm p-1.5">
      <span
        role="img"
        aria-label={`${name}, ${roleLabel}`}
        className="grid size-[30px] shrink-0 place-items-center rounded-sm bg-peach text-xs font-semibold text-navy"
      >
        {initialsOf(name)}
      </span>
      <span className="sb-hide min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-semibold text-offwhite">{name}</span>
        <span className="block truncate text-caption text-on-navy-muted">{roleLabel}</span>
      </span>
      <form action={signOutAction}>
        <Hint label="Sign out" side="top">
          <button
            type="submit"
            aria-label="Sign out"
            className="grid size-8 place-items-center rounded-sm text-on-navy-text outline-offset-2 outline-offwhite transition-colors hover:bg-on-navy-10 hover:text-offwhite"
          >
            <SignOut aria-hidden size={17} />
          </button>
        </Hint>
      </form>
    </div>
  );
}
