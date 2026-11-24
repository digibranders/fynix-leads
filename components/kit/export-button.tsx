import { DownloadSimple } from "@phosphor-icons/react/dist/ssr";
import { buttonVariants } from "@/components/ui/button";

/** A link to a CSV the server builds from the viewer's own rows (`/api/export/...`). On a phone only the icon shows. */
export function ExportButton({ href, label = "Export CSV" }: { readonly href: string; readonly label?: string }) {
  return (
    <a href={href} download className={buttonVariants({ variant: "secondary", size: "sm" })} aria-label={label}>
      <DownloadSimple aria-hidden weight="bold" />
      <span className="max-sm:sr-only">{label}</span>
    </a>
  );
}

/** The address of an export: the kind of file and the campaign the list is narrowed to, if any. */
export function exportHref(kind: "leads" | "meetings", campaign: string | null): string {
  return campaign === null ? `/api/export/${kind}` : `/api/export/${kind}?campaign=${encodeURIComponent(campaign)}`;
}
