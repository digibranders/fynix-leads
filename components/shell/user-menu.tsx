import Link from "next/link";
import { SignOut, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { Hint } from "@/components/ui/hint";
import { initialsOf } from "@/lib/auth/display";
import { signOutAction } from "@/server/auth/actions";

/** The signed-in person at the foot of the sidebar (and of the phone's More sheet), with a link to their profile and sign-out. A server component: the action posts straight from the form. */
export function UserMenu({ name, roleLabel, profileHref }: { name: string; roleLabel: string; profileHref: string }) {
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
      <Hint label="Profile" side="top">
        <Link
          href={profileHref}
          aria-label="Profile"
          className="grid size-8 place-items-center rounded-sm text-on-navy-text outline-offset-2 outline-offwhite transition-colors hover:bg-on-navy-10 hover:text-offwhite"
        >
          <UserCircle aria-hidden size={17} />
        </Link>
      </Hint>
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
