'use client';

// IconButton (A2.4): a round icon-only button whose name is its tooltip, so
// sighted mouse and keyboard users see what screen readers hear.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Tooltip from './tooltip';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> & {
  /** Accessible name and tooltip text ("Hide balances"). */
  label: string;
  children: ReactNode;
};

export default function IconButton({ label, children, className = 'x-btn x-btn--icon', type = 'button', ...rest }: Props) {
  return (
    <Tooltip label={label}>
      <button type={type} aria-label={label} className={className} {...rest}>{children}</button>
    </Tooltip>
  );
}
