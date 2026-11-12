import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";

/** The one primary button of a form. While pending it is disabled, keeps the navy-hover fill (so the label stays readable) and names what it is doing. */
export function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full disabled:bg-navy-hover disabled:opacity-100">
      {pending ? (
        <>
          <CircleNotch aria-hidden className="motion-safe:animate-spin" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}
