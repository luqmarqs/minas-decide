import type { MouseEvent, ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { buttonClasses, type ButtonSize, type ButtonVariant } from '@/components/ui/buttonStyles';
import { JOIN_SECTION_ID, scrollToJoin } from './join';

export interface JoinCtaProps {
  children?: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
}

/**
 * "Participar" call to action (owner decision D28). On the home page it is an in-page link
 * to `#participar` with smooth scroll (reduced motion → jump); elsewhere it goes to
 * `/participar`. Always the primary (blue) style — yellow is reserved for "Eu vou".
 */
export function JoinCta({
  children = 'Quero participar',
  size = 'md',
  variant = 'primary',
  className,
}: JoinCtaProps) {
  const { pathname } = useLocation();
  const classes = buttonClasses(variant, size, className);
  if (pathname !== '/') {
    return (
      <Link to="/participar" className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={`#${JOIN_SECTION_ID}`}
      className={classes}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (scrollToJoin()) e.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
