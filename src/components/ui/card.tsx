import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Card primitives.
 *
 * One level of nesting only (DESIGN.md §8). An edge, never an edge plus a wide
 * shadow: `--border-subtle` 1px on `--surface-raised`, no elevation until the
 * element genuinely floats (dialog/popover).
 */

const cardVariants = cva('rounded-md', {
  variants: {
    tone: {
      raised: 'bg-surface-raised border border-border-subtle',
      sunken: 'bg-surface-sunken border border-border-subtle',
      plain: 'bg-transparent border border-border-subtle',
      /** Attention without alarm: a tinted surface, never a colored border. */
      critical: 'bg-surface-raised border border-border-subtle border-l-[3px] border-l-status-critical',
      warning: 'bg-surface-raised border border-border-subtle border-l-[3px] border-l-status-warning',
      healthy: 'bg-surface-raised border border-border-subtle border-l-[3px] border-l-status-healthy',
    },
    padding: {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-5',
    },
  },
  defaultVariants: { tone: 'raised', padding: 'md' },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, tone, padding, ...props }: CardProps) {
  return <div className={cn(cardVariants({ tone, padding }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[15px] font-semibold text-text-primary', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[13px] text-text-secondary text-balance-pretty', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4', className)}
      {...props}
    />
  );
}

export { cardVariants };
