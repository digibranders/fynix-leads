import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Label } from "@/components/ui/label";

type Props = {
  id: string;
  label: string;
  helper?: string;
  error?: string;
  children: React.ReactNode;
};

/** Label above, control, then helper text. Error text replaces the helper, carries an icon (never colour alone) and is announced as an alert. The control sets `aria-describedby` to `${id}-message`. */
export function Field({ id, label, helper, error, children }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-message`} role="alert" className="flex items-start gap-1 text-xs text-destructive">
          <WarningCircle aria-hidden size={14} weight="fill" className="mt-px shrink-0" />
          {error}
        </p>
      ) : (
        helper && (
          <p id={`${id}-message`} className="text-xs text-muted-foreground">
            {helper}
          </p>
        )
      )}
    </div>
  );
}
