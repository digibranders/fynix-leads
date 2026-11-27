"use client";

import { useSelectedLayoutSegment } from "next/navigation";

/** The campaign title and its tabs are for reading the campaign. On the edit page the edit tabs are the only tabs, so these step out of the way. */
export function HideWhileEditing({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment();
  return segment === "edit" ? null : <>{children}</>;
}
