import { Badge } from "@/components/ui/badge";

/** The small "Closed" tag on a lead, meeting or thread row whose campaign is closed. */
export function ClosedTag() {
  return (
    <Badge variant="amber" size="sm">
      Closed
    </Badge>
  );
}
