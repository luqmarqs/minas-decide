import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Icon } from './Icon';

export interface ErrorStateProps {
  title?: string;
  message: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  requestId?: string;
  className?: string;
  compact?: boolean;
}

/** Honest error: what failed, what still works, how to retry. Never a stack trace. */
export function ErrorState({
  title = 'Algo não carregou',
  message,
  onRetry,
  retrying,
  requestId,
  className,
  compact,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex gap-3 rounded-md border border-error/40 bg-error-soft text-primary',
        compact ? 'p-3 text-sm' : 'p-4',
        className,
      )}
    >
      <Icon name="alert" className="mt-0.5 shrink-0 text-error" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <div className="text-secondary">{message}</div>
        {requestId ? (
          <p className="mt-1 font-mono text-xs text-muted">Código: {requestId}</p>
        ) : null}
        {onRetry ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={onRetry}
            loading={retrying}
          >
            Tentar de novo
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-dashed border-border-strong p-4 text-primary',
        className,
      )}
    >
      <p className="font-semibold">{title}</p>
      {description ? <div className="mt-1 text-sm text-secondary">{description}</div> : null}
      {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

/** Neutral explanatory note (methodology, approximations). */
export function Note({
  children,
  className,
  tone = 'info',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'info' | 'warning';
}) {
  return (
    <div
      className={cn(
        'flex gap-2 rounded-md p-3 text-sm',
        tone === 'info' ? 'bg-info-soft text-primary' : 'bg-warning-soft text-primary',
        className,
      )}
    >
      <Icon
        name={tone === 'info' ? 'info' : 'alert'}
        size={18}
        className={cn('mt-0.5 shrink-0', tone === 'info' ? 'text-info' : 'text-warning')}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
