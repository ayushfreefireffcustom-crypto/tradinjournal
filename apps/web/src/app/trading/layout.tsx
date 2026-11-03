import type { ReactNode } from 'react';
import ComingSoon from '@/components/v6/ui/coming-soon';
import { TRADING_ENABLED } from '@/lib/features';

// The trading desk and its sub-pages only exist with the trading platform switched on.
export default function TradingLayout({ children }: { children: ReactNode }) {
  return TRADING_ENABLED ? children : <ComingSoon title="Trading" what="Trading from TRADElogs" icon="run" />;
}
