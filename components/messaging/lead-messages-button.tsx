"use client";

import { ChatsCircle, CircleNotch } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openLeadThreadAction } from "@/server/domain/message-actions";

/**
 * "Messages" on a lead's record: opens the thread about this lead in the person's Messages page, made on first use. Fynix has one button per side, since the
 * client's thread and the coordinator's are separate and neither reads the other's.
 */
export function LeadMessagesButton({ leadId, side, label = "Messages" }: { readonly leadId: string; readonly side?: "client_fynix" | "supplier_fynix"; readonly label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await openLeadThreadAction(leadId, side);
          if (result.status === "success" && result.href !== undefined) router.push(result.href);
          else toast.error(result.message ?? "The conversation could not be opened. Try again.");
        })
      }
    >
      {pending ? <CircleNotch aria-hidden className="motion-safe:animate-spin" /> : <ChatsCircle aria-hidden weight="bold" />}
      {label}
    </Button>
  );
}
