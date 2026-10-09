import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export const TooltipProvider = RadixTooltip.Provider;

/**
 * Supplementary hint only — never the sole carrier of essential information
 * (tooltips are unreliable on touch).
 */
export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    // Self-contained provider: the root of the app does not pay for Radix Tooltip /
    // floating-ui unless a tooltip is actually rendered (P-PERF-1).
    <RadixTooltip.Provider delayDuration={300}>
      <RadixTooltip.Root delayDuration={300}>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className="z-(--z-toast) max-w-xs rounded-sm bg-(--color-text-primary) px-2 py-1 text-xs text-(--color-surface) shadow-raised"
          >
            {content}
            <RadixTooltip.Arrow className="fill-(--color-text-primary)" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
