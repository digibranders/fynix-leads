"use client";

import { WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { MessagePage } from "@/components/shell/message-page";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <MessagePage
      icon={WarningCircle}
      title="Something went wrong"
      actions={
        <>
          <Button onClick={() => retry()}>Try again</Button>
          <Button variant="secondary" nativeButton={false} render={<Link href="/" />}>
            Back to the start
          </Button>
        </>
      }
    >
      This screen could not be shown. Try again, or go back to the start. Nothing was saved or lost.
    </MessagePage>
  );
}
