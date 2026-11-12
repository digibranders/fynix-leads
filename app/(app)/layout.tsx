import { AuthFrame } from "@/components/auth/auth-frame";

/**
 * A static frame with nothing private in it. The page puts its own `<Suspense>` boundary around the session read: a
 * boundary in this layout would not count when the page is reached by a client navigation (the layout does not re-render).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AuthFrame>{children}</AuthFrame>;
}
