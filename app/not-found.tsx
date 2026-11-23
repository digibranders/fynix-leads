import { Compass } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { MessagePage } from "@/components/shell/message-page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <MessagePage
      icon={Compass}
      title="Page not found"
      actions={
        <Button nativeButton={false} render={<Link href="/" />}>
          Back to the start
        </Button>
      }
    >
      This address does not match a page. Check the address, or go back to the start.
    </MessagePage>
  );
}
