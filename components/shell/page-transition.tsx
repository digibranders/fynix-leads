/**
 * Wraps a portal's pages so a new screen eases in on a phone. It is used from each portal's `template.tsx`, which React remounts on every
 * navigation, so the animation replays for each screen and not for each change of a filter. The motion itself is CSS (`.page-in`).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
