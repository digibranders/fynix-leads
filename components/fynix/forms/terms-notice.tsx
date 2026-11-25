import Link from "next/link";
import { Notice } from "@/components/auth/notice";

/**
 * Said above a form that sends an invite when the terms of that side are not published: the record is still saved, but the invite email
 * cannot go out, and the person finds that out only from a message afterwards. Nothing is shown when the terms are there.
 */
export function TermsNotice({ missing, side }: { missing: boolean; side: string }) {
  if (!missing) return null;
  return (
    <Notice tone="amber">
      <span>
        No terms are published for {side} yet, so the invite cannot go out. You can still add them and invite them later, or{" "}
        <Link href="/fynix/settings" className="font-semibold underline underline-offset-2">
          publish the terms in Settings
        </Link>{" "}
        first.
      </span>
    </Notice>
  );
}
