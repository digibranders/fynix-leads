"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ToastButton() {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toast("Lead LD-4K9P approved", {
          description: "The agency sees this as a decision from Client.",
          action: { label: "Undo", onClick: () => toast("Approval undone") },
        })
      }
    >
      Show toast
    </Button>
  );
}
