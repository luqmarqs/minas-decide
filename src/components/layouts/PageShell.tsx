import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PageShellProps {
  title: ReactNode;
  /** Document title (defaults to plain-text title when it is a string). */
  documentTitle?: string;
  lead?: ReactNode;
  eyebrow?: ReactNode;
  children?: ReactNode;
  className?: string;
  width?: 'prose' | 'wide';
}

/** Standard content page: readable measure, consistent rhythm. */
export function PageShell({
  title,
  documentTitle,
  lead,
  eyebrow,
  children,
  className,
  width = 'prose',
}: PageShellProps) {
  const docTitle = documentTitle ?? (typeof title === 'string' ? title : undefined);
  return (
    <div
      className={cn(
        'mx-auto w-full px-(--gutter) py-8 sm:py-12',
        width === 'prose' ? 'max-w-3xl' : 'max-w-(--content-max) lg:px-6',
        className,
      )}
    >
      {docTitle ? <title>{`${docTitle} — Minas em Movimento`}</title> : null}
      {eyebrow ? <div className="mb-2">{eyebrow}</div> : null}
      <h1 className="text-3xl sm:text-4xl">{title}</h1>
      {lead ? <div className="mt-3 text-lg text-secondary">{lead}</div> : null}
      <div className="mt-8">{children}</div>
    </div>
  );
}

/** Long-form text styles without a typography plugin. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 text-base text-primary',
        '[&_h2]:mt-6 [&_h2]:text-2xl [&_h3]:mt-4 [&_h3]:text-xl [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc',
        '[&_a]:underline [&_a]:underline-offset-2 [&_p]:text-secondary [&_li]:text-secondary',
        className,
      )}
    >
      {children}
    </div>
  );
}
