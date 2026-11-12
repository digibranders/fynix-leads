import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/auth/actions";

/** A plain form that posts to the sign-out action: it works without client JavaScript. */
export function SignOutForm() {
  return (
    <form action={signOutAction} className="mt-3.5">
      <Button type="submit">
        <SignOut aria-hidden />
        Sign out
      </Button>
    </form>
  );
}
