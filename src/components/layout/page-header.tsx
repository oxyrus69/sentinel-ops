import { cn } from '@/lib/cn';

/**
 * Contextual sub-header (Zona C) used by every authenticated screen.
 *
 * Unlike a marketing page heading, this bar is part of the workspace chrome:
 * it carries the h1, a one-line description, a live count badge, a segmented
 * view switcher, and the page-level actions — all in one 48–56px row so the
 * data below keeps the vertical space.
 *
 * The breadcrumb that used to live here now sits in the top utility bar
 * (Zona B), where it stays visible while scrolling.
 */

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Live total next to the title, e.g. row count. */
  count?: { value: number | string; label: string };
  /** Segmented view switcher (Tabel / Kanban / Analitik). */
  views?: React.ReactNode;
  /** Status ribbon under the title, e.g. active filters. */
  badge?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  count,
  views,
  badge,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border-subtle pb-3',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[17px] font-semibold leading-tight tracking-[-0.01em] text-text-primary">
            {title}
          </h1>
          {count ? (
            <span className="numeric rounded-sm border border-border-subtle bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium text-text-secondary">
              {count.value}
              <span className="ml-1 font-sans font-normal text-text-muted">{count.label}</span>
            </span>
          ) : null}
          {badge}
        </div>
        {description ? (
          <p className="mt-1 max-w-[90ch] text-[12px] leading-snug text-text-muted">{description}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {views}
        {actions}
      </div>
    </header>
  );
}
