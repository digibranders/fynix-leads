import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { barPercent, progressTicks } from "@/lib/campaign/progress";

type Props = {
  delivered: number;
  totalTarget: number;
  monthlyTarget: number;
};

/** The one navy hero tile of the agency overview. The serif figure is the only Geist Serif text in the app. */
export function CampaignHero({ delivered, totalTarget, monthlyTarget }: Props) {
  const months = monthlyTarget > 0 ? Math.round(totalTarget / monthlyTarget) : 0;
  const pct = (n: number) => `${barPercent(n, totalTarget)}%`;
  // A numeral every full month: 12, 24, ... below the target, which has its own marker.
  const ticks = progressTicks(totalTarget, monthlyTarget);

  return (
    <section
      aria-label="Progress toward target"
      className="relative flex min-h-[244px] flex-col xl:h-[244px] overflow-hidden rounded-lg bg-navy px-[26px] pt-[22px] pb-5 text-offwhite shadow-hero before:pointer-events-none before:absolute before:-top-[110px] before:-right-[90px] before:size-[360px] before:rounded-full before:bg-(image:--hero-glow)"
    >
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-body font-semibold">Progress toward target</h2>
        <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-on-navy-07 pr-[11px] pl-2 text-label text-on-navy-text">
          <CheckCircle aria-hidden weight="fill" size={14} />
          Approved with a completed meeting
        </span>
      </div>

      <p className="relative z-10 mt-2 flex flex-wrap items-baseline gap-x-3.5">
        <span className="font-serif text-hero font-normal tracking-[-0.02em]">{delivered}</span>
        <span className="font-serif text-[42px] leading-[48px] text-offwhite/65">of {totalTarget}</span>
        <span className="ml-0.5 text-[19px] font-medium text-peach">delivered</span>
      </p>

      <div className="relative z-10 mt-auto">
        <div className="mb-2.5 flex justify-between gap-3 text-label text-on-navy-text">
          <span>
            {monthlyTarget} a month for {months} months
          </span>
          <b className="font-semibold text-offwhite">Target {totalTarget}</b>
        </div>
        <div
          role="img"
          aria-label={`${delivered} of ${totalTarget} delivered`}
          className="relative h-2.5 rounded-full bg-on-navy-10"
        >
          <div
            className="absolute inset-y-0 left-0 min-w-3 rounded-full bg-peach shadow-glow"
            style={{ width: pct(delivered) }}
          />
          {ticks.map((tick) => (
            <span key={tick} aria-hidden className="absolute -top-1 -bottom-1 w-px bg-on-navy-16" style={{ left: pct(tick) }} />
          ))}
          <span aria-hidden className="absolute -top-1.5 -right-px -bottom-1.5 w-[3px] rounded-[2px] bg-offwhite" />
        </div>
        <div aria-hidden className="relative mt-[9px] h-[18px]">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute top-0 -translate-x-full text-[11.5px] text-on-navy-muted"
              style={{ left: pct(tick) }}
            >
              {tick}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
