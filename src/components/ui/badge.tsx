import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Status vocabulary.
 *
 * Status is never communicated by color alone: every badge carries a text
 * label, and `showDot` adds a shape cue. Contrast pairs come from DESIGN.md §3.
 */

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[12px] font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-overlay text-text-secondary border border-border-subtle',
        healthy: 'bg-status-healthy/15 text-status-healthy border border-status-healthy/30',
        warning: 'bg-status-warning/15 text-status-warning border border-status-warning/30',
        critical: 'bg-status-critical/15 text-status-critical border border-status-critical/30',
        info: 'bg-status-info/15 text-status-info border border-status-info/30',
        accent: 'bg-accent-subtle text-accent border border-accent/30',
      },
      variant: {
        soft: '',
        solid: 'border-transparent',
      },
      size: {
        sm: 'text-[11px] px-1.5 py-0',
        md: '',
      },
    },
    compoundVariants: [
      { tone: 'healthy', variant: 'solid', class: 'bg-status-healthy text-text-inverse' },
      { tone: 'warning', variant: 'solid', class: 'bg-status-warning text-text-inverse' },
      { tone: 'critical', variant: 'solid', class: 'bg-status-critical text-white' },
      { tone: 'info', variant: 'solid', class: 'bg-status-info text-text-inverse' },
      { tone: 'neutral', variant: 'solid', class: 'bg-status-neutral text-white' },
      { tone: 'accent', variant: 'solid', class: 'bg-accent text-text-inverse' },
    ],
    defaultVariants: { tone: 'neutral', variant: 'soft', size: 'md' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  showDot?: boolean;
}

export function Badge({
  className,
  tone,
  variant,
  size,
  showDot = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, variant, size }), className)} {...props}>
      {showDot ? <StatusDot tone={tone} /> : null}
      {children}
    </span>
  );
}

/** Static dot. Never animated: motion here would imply activity that is not happening. */
export function StatusDot({ tone }: { tone?: BadgeProps['tone'] }) {
  const color =
    tone === 'healthy'
      ? 'bg-status-healthy'
      : tone === 'warning'
        ? 'bg-status-warning'
        : tone === 'critical'
          ? 'bg-status-critical'
          : tone === 'info'
            ? 'bg-status-info'
            : tone === 'accent'
              ? 'bg-accent'
              : 'bg-status-neutral';
  return <span aria-hidden="true" className={cn('inline-block h-1.5 w-1.5 rounded-full', color)} />;
}

/* -------------------------------------------------------------------------- */
/* Domain-specific badge mappers                                              */
/* -------------------------------------------------------------------------- */

const HEALTH_TONE = {
  HEALTHY: 'healthy',
  WARNING: 'warning',
  COMPROMISED: 'critical',
  DOWN: 'critical',
  MAINTENANCE: 'neutral',
} as const;

const HEALTH_LABEL = {
  HEALTHY: 'Sehat',
  WARNING: 'Peringatan',
  COMPROMISED: 'Terkompromi',
  DOWN: 'Mati',
  MAINTENANCE: 'Pemeliharaan',
} as const;

export function HealthBadge({ status }: { status: keyof typeof HEALTH_TONE }) {
  return (
    <Badge tone={HEALTH_TONE[status]} showDot>
      {HEALTH_LABEL[status]}
    </Badge>
  );
}

const SEVERITY_TONE = {
  CRITICAL: 'critical',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
} as const;

const SEVERITY_LABEL = {
  CRITICAL: 'Kritis',
  HIGH: 'Tinggi',
  MEDIUM: 'Sedang',
  LOW: 'Rendah',
} as const;

export function SeverityBadge({ severity }: { severity: keyof typeof SEVERITY_TONE }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Badge>;
}

const ISTATUS_TONE = {
  OPEN: 'critical',
  INVESTIGATING: 'warning',
  CONTAINED: 'info',
  RESOLVED: 'healthy',
  CLOSED: 'neutral',
} as const;

const ISTATUS_LABEL = {
  OPEN: 'Terbuka',
  INVESTIGATING: 'Investigasi',
  CONTAINED: 'Terkendali',
  RESOLVED: 'Selesai',
  CLOSED: 'Ditutup',
} as const;

export function IncidentStatusBadge({ status }: { status: keyof typeof ISTATUS_TONE }) {
  return <Badge tone={ISTATUS_TONE[status]}>{ISTATUS_LABEL[status]}</Badge>;
}

const PLATFORM_LABEL: Record<string, string> = {
  OJS_3: 'OJS 3',
  WORDPRESS: 'WordPress',
  LARAVEL: 'Laravel',
  NODE_SSR: 'Node.js',
  STATIC_WEB: 'Statis',
  CUSTOM_PHP: 'PHP Kustom',
};

export function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className="numeric rounded-sm border border-border-subtle bg-surface-sunken px-1.5 py-0.5 text-[11px] text-text-secondary">
      {PLATFORM_LABEL[platform] ?? platform}
    </span>
  );
}

/** Generic small tag used for categories and metadata. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-sm border border-border-subtle px-1.5 py-0.5 text-[11px] text-text-muted">
      {children}
    </span>
  );
}

export { badgeVariants };

/** The tone vocabulary, exported so callers can type a tone lookup table. */
export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;
