'use client';

import { authClient } from '@/lib/auth-client';
import { useTerminalEntry } from '@/components/terminal-entry';

interface Props {
  children: React.ReactNode;
  href?: string;
  className?: string;
  testId?: string;
}

/** GET STARTED / open terminal — runs activity gate for logged-in users. */
export default function TerminalCtaButton({ children, href = '/dashboard', className = '', testId }: Props) {
  const { data: session } = authClient.useSession();
  const { enterTerminal, checking, InactiveModal } = useTerminalEntry();

  if (!session?.session) {
    return (
      <a href="/login" className={className} data-testid={testId}>
        {children}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={checking}
        onClick={() => void enterTerminal(href)}
        className={className}
        data-testid={testId}
        aria-busy={checking}
      >
        {checking ? 'CHECKING…' : children}
      </button>
      {InactiveModal}
    </>
  );
}
