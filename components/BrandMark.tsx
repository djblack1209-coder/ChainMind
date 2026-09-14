import brand from "@/lib/brand.json";

type BrandSize = "sm" | "md" | "lg";
interface BrandMarkProps {
  size?: BrandSize;
  showWordmark?: boolean;
  subtitle?: string;
  className?: string;
}
const SIZES = {
  sm: { icon: "h-10 w-10", gap: "gap-2.5", title: "text-lg", subtitle: "text-[10px]" },
  md: { icon: "h-11 w-11", gap: "gap-3", title: "text-xl", subtitle: "text-[10px]" },
  lg: { icon: "h-14 w-14", gap: "gap-3.5", title: "text-3xl", subtitle: "text-xs" },
};
export default function BrandMark({ size = "md", showWordmark = false, subtitle, className = "" }: BrandMarkProps) {
  const s = SIZES[size];
  return (
    <div className={`flex items-center ${s.gap} ${className}`.trim()}>
      <svg viewBox={brand.viewBox} className={`shrink-0 ${s.icon}`} aria-hidden="true" focusable="false">
        <rect width="64" height="64" rx="18" fill={brand.colors.ink} />
        <g transform="translate(6 6) scale(.8125)">
          <path d={brand.ribbon} fill={brand.colors.lime} />
          <path d={brand.ribbon} transform="rotate(180 32 32)" fill={brand.colors.jade} />
        </g>
      </svg>
      {showWordmark && (
        <div>
          <div className={`font-display font-semibold tracking-tight leading-none text-[var(--text-primary)] ${s.title}`}>{brand.name}</div>
          {subtitle && <div className={`mt-0.5 text-[var(--text-tertiary)] ${s.subtitle}`}>{subtitle}</div>}
        </div>
      )}
    </div>
  );
}
