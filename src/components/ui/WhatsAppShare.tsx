import { buttonClasses, type ButtonSize, type ButtonVariant } from './buttonStyles';
import { useToast } from './toastContext';
import { cn } from '@/lib/cn';
import { copyText, SHARE_FEEDBACK, whatsAppHref } from '@/lib/share';

/** Simple WhatsApp glyph (speech bubble + handset), decorative. */
function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.5 20.5 5 16.3A8.5 8.5 0 1 1 8 19.2l-4.5 1.3Z" />
      <path d="M9 8.6c.2-.5.5-.6.8-.6h.5c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .5-.1.6l-.5.6c.6 1.2 1.6 2.2 2.8 2.8l.6-.5c.2-.2.4-.2.6-.1l1.5.6c.3.1.4.3.4.5v.5c0 .3-.1.6-.6.8-1.6.7-5.6-1.3-6.9-4.8-.3-.8-.3-1.6-.2-2.3Z" />
    </svg>
  );
}

export interface WhatsAppShareProps {
  /** Full message (PT-BR) including the absolute link. */
  text: string;
  /** URL offered by the discreet "copiar link" secondary action (omit to hide it). */
  copyUrl?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  label?: string;
}

/**
 * "Compartilhar no WhatsApp" (owner decision D26): a real link to wa.me (works on mobile
 * without popup blocking), new tab, `rel="noopener noreferrer"`. Copying the link stays as
 * a small secondary action with honest feedback.
 */
export function WhatsAppShare({
  text,
  copyUrl,
  variant = 'secondary',
  size = 'sm',
  className,
  label = 'Compartilhar no WhatsApp',
}: WhatsAppShareProps) {
  const toast = useToast();
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <a
        href={whatsAppHref(text)}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClasses(variant, size)}
      >
        <WhatsAppIcon />
        {label}
        <span className="sr-only">(abre o WhatsApp em nova aba)</span>
      </a>
      {copyUrl ? (
        <button
          type="button"
          className="inline-flex min-h-11 items-center text-sm text-secondary underline underline-offset-2 hover:text-primary"
          onClick={async () => {
            const outcome = await copyText(copyUrl);
            toast.show({
              title: SHARE_FEEDBACK[outcome],
              variant: outcome === 'failed' ? 'error' : 'success',
            });
          }}
        >
          copiar link
        </button>
      ) : null}
    </span>
  );
}
