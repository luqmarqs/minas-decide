import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface SidePanelProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: ReactNode;
  className?: string;
  headerExtra?: ReactNode;
}

/**
 * Desktop contextual panel (spec §12.3): expandable/collapsible, not modal.
 * Entry animation uses --duration-panel (180–280 ms; 0 ms under prefers-reduced-motion).
 */
export function SidePanel({
  open,
  title,
  subtitle,
  onClose,
  collapsed = false,
  onCollapsedChange,
  children,
  className,
  headerExtra,
}: SidePanelProps) {
  const headingId = useId();
  const bodyId = useId();
  return open ? (
    <aside
      aria-labelledby={headingId}
      className={cn(
        'flex max-h-full w-(--panel-width) animate-[panel-in_var(--duration-panel)_var(--easing-emphasized)] flex-col overflow-hidden rounded-card border border-border bg-surface-raised text-primary shadow-raised',
        className,
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h2 id={headingId} className="truncate text-xl">
            {title}
          </h2>
          {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center">
          {headerExtra}
          {onCollapsedChange ? (
            <button
              type="button"
              className="grid size-11 place-items-center rounded-md text-secondary hover:bg-surface-alt"
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              aria-label={collapsed ? 'Expandir painel' : 'Recolher painel'}
              onClick={() => onCollapsedChange(!collapsed)}
            >
              <Icon
                name={collapsed ? 'chevronDown' : 'chevronRight'}
                className={collapsed ? '' : 'rotate-90'}
              />
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="grid size-11 place-items-center rounded-md text-secondary hover:bg-surface-alt"
              aria-label="Fechar painel"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
          ) : null}
        </div>
      </header>
      <div
        id={bodyId}
        hidden={collapsed}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
      >
        {children}
      </div>
    </aside>
  ) : null;
}
