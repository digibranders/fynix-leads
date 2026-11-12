import Link from "next/link";
import { Notice, type NoticeTone } from "@/components/auth/notice";
import { buttonVariants } from "@/components/ui/button";

type Reason = "invalid" | "expired" | "revoked" | "redeemed" | "rate-limited";

const TONE: Readonly<Record<Reason, NoticeTone>> = { invalid: "red", expired: "red", revoked: "red", redeemed: "blue", "rate-limited": "amber" };

/** The body of the accept-invite dead link state. Shows a sentence and never a name or an address. Only a used invite has somewhere to go. */
export function InviteUnavailable({ reason, message }: { reason: Reason; message: string }) {
  return (
    <div className="mt-5 flex flex-col gap-[18px]">
      <Notice tone={TONE[reason]}>{message}</Notice>
      {reason === "redeemed" && (
        <Link href="/sign-in" className={buttonVariants({ className: "w-full" })}>
          Sign in
        </Link>
      )}
    </div>
  );
}
