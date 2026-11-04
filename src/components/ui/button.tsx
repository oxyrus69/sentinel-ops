import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * Button.
 *
 * Variants map to DESIGN.md §8: `primary` is the single accent fill, `danger`
 * for destructive actions, everything else is a quiet surface treatment. No
 * gradient, no glow.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors duration-fast ease-standard disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-text-inverse hover:bg-accent-hover active:bg-accent',
        secondary:
          'bg-surface-overlay text-text-primary border border-border-subtle hover:border-border-strong hover:bg-surface-raised',
        ghost:
          'bg-transparent text-text-secondary hover:bg-surface-raised hover:text-text-primary',
        danger:
          'bg-danger text-white hover:brightness-110 active:brightness-100',
        dangerGhost:
          'bg-transparent text-danger border border-danger/40 hover:bg-danger-subtle',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-9 px-4 text-[13px]',
        lg: 'h-10 px-5 text-sm',
        icon: 'h-9 w-9 p-0',
        iconSm: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (useful inside links / form triggers). */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
