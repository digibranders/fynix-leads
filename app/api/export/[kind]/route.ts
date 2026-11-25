import { getSessionContext } from "@/server/auth";
import { getDatabase } from "@/server/db/client";
import { exportLeadsCsv, exportMeetingsCsv, type ExportActor, type ExportFilter } from "@/server/domain/export-reads";

/**
 * A CSV of the viewer's own leads or meetings, for any signed-in portal. What the file holds is what that viewer's screens read: the export goes through
 * the viewer's own database role and column list, so a client's file never names an agency and an agency's never names a client person. Cells that start
 * with = + - or @ are written as text by `toCsv`. Anyone not signed in, and any other kind, gets the same plain 404. `?campaign=` narrows it to one campaign.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { kind } = await context.params;
  if (kind !== "leads" && kind !== "meetings") return notFound();
  const session = await getSessionContext();
  if (session === null) return notFound();

  const campaign = new URL(request.url).searchParams.get("campaign");
  if (campaign !== null && !UUID.test(campaign)) return notFound();
  // Only Fynix may narrow a file to the leads one agency sent: a tenant's own rows are already its own, and its role cannot read every lead's source.
  const source = new URL(request.url).searchParams.get("source");
  if (source !== null && !UUID.test(source)) return notFound();
  const filter: ExportFilter = {
    ...(campaign === null ? {} : { campaignId: campaign }),
    ...(source === null || session.kind !== "fynix" ? {} : { sourceOrgId: source }),
  };

  const role = session.kind === "client" ? "leads_client" : session.kind === "agency" ? "leads_agency" : "leads_fynix";
  const actor: ExportActor = session.kind === "fynix" ? { userId: session.userId } : { userId: session.userId, orgId: session.orgId, orgKind: session.kind, role: session.memberRole };
  const db = getDatabase(role).db;
  const csv = kind === "leads" ? await exportLeadsCsv(db, actor, filter) : await exportMeetingsCsv(db, actor, filter);

  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${day}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
