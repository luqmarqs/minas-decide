import { cn } from '@/lib/cn';

/** Placeholder block; moderate pulse only when motion is allowed. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-sm bg-surface-alt motion-safe:animate-pulse', className)}
    />
  );
}

/** Accessible loading region: skeleton lines + text for assistive tech. */
export function LoadingBlock({
  label = 'Carregando…',
  lines = 3,
}: {
  label?: string;
  lines?: number;
}) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}
