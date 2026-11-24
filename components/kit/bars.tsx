/**
 * A column chart of one value per period against a target line. The last column is the current period and is drawn solid.
 * Plain CSS, no chart library: the data is a handful of columns. A text table follows for assistive tech.
 */
export function Columns({ data, target, unit }: { data: readonly { label: string; value: number }[]; target: number; unit: string }) {
  const plot = 140;
  const labelRoom = 26;
  const top = Math.max(target, ...data.map((d) => d.value));
  return (
    <div>
      <div className="relative flex items-end gap-4 px-2" style={{ height: plot + labelRoom + 18 }} aria-hidden>
        <div className="absolute inset-x-0 border-t border-dashed border-ink-muted/60" style={{ bottom: labelRoom + (target / top) * plot }}>
          <span className="absolute -top-[18px] right-0 text-[11px] text-ink-muted">
            Target {target}
          </span>
        </div>
        {data.map((point, index) => (
          <div key={point.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs font-semibold text-ink-2">{point.value}</span>
            <i
              className={`block w-full max-w-14 rounded-t-xs rounded-b-[2px] ${index === data.length - 1 ? "bg-navy" : "bg-navy-10"}`}
              style={{ height: (point.value / top) * plot }}
            />
            <span className="mt-1 text-xs text-ink-muted" style={{ height: labelRoom - 8 }}>
              {point.label}
            </span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{unit} by month, target {target}</caption>
        <tbody>
          {data.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
