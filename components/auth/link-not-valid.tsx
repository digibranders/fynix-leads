import Link from "next/link";
import { Notice } from "@/components/auth/notice";
import { buttonVariants } from "@/components/ui/button";
import { RESET_LINK_INVALID } from "@/lib/auth/messages";

/** The body of the dead link state: a reset link that is missing, used already or older than an hour. */
export function LinkNotValid() {
  return (
    <div className="mt-[22px] flex flex-col gap-[18px]">
      <Notice tone="red" className="-mt-1">
        {RESET_LINK_INVALID}
      </Notice>
      <Link href="/forgot-password" className={buttonVariants({ className: "w-full" })}>
        Ask for a new link
      </Link>
    </div>
  );
}
