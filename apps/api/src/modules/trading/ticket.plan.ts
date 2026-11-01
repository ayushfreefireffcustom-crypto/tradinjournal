// Order ticket rules (D10, D11, D13), pure so every rule is unit tested. The
// preview and the real send both run this, so what the user reviewed is what
// gets checked again at the moment it's sent.
import type { OrderTicketInput, TicketPreviewDto, TicketQuoteDto } from '@tradinjournal/contracts';

const MARKETABLE_WARN = 0.002; // a limit this far through the mark fills straight away
const FAR_WARN = 0.2; // a price 20 % from the mark is probably a typo
const MARGIN_WARN = 0.8; // using over 80 % of what's available

/** Round to the venue's tick; prices like 0.1 + 0.2 never leak float noise. */
export function toTick(price: number, tick: number): number {
  if (!(tick > 0)) return price;
  const decimals = Math.max(0, Math.ceil(-Math.log10(tick)) + 1);
  return Number((Math.round(price / tick) * tick).toFixed(decimals));
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2));

export function planTicket(t: OrderTicketInput, q: TicketQuoteDto): TicketPreviewDto {
  const errors: string[] = [];
  const warnings: string[] = [];
  const buy = t.side === 'BUY';
  const isLimit = t.type === 'LIMIT' || t.type === 'STOP_LIMIT';
  const isStop = t.type === 'STOP_MARKET' || t.type === 'STOP_LIMIT';
  const mark = q.markPrice;

  if (!q.live) errors.push(`${q.symbol} isn't trading right now.`);
  if (q.environment === 'LIVE' && !t.confirmLive) errors.push('This is a real-money account: confirm that before sending.');

  const limitPrice = isLimit ? (t.limitPrice ? toTick(t.limitPrice, q.tickSize) : null) : null;
  const stopPrice = isStop ? (t.stopPrice ? toTick(t.stopPrice, q.tickSize) : null) : null;
  if (isLimit && !limitPrice) errors.push('Enter a limit price.');
  if (isStop && !stopPrice) errors.push('Enter a trigger price.');
  if (!isLimit && t.limitPrice) warnings.push('The limit price is ignored for this order type.');
  if (!isStop && t.stopPrice) warnings.push('The trigger price is ignored for this order type.');

  const tif = isLimit ? (t.tif ?? 'GTC') : null;
  const postOnly = isLimit && !!t.postOnly;
  if (postOnly && tif === 'IOC') errors.push('Post-only needs good-till-cancelled: an IOC order can never rest on the book.');

  // Reference price for sizing and checks: what the order is expected to fill at.
  const refPrice = t.type === 'MARKET' ? mark : t.type === 'STOP_MARKET' ? stopPrice : limitPrice;
  if (refPrice == null && t.type === 'MARKET') errors.push(`No mark price for ${q.symbol} right now; try again in a moment.`);

  // Where things sit against the mark.
  if (mark && limitPrice && t.type === 'LIMIT') {
    const through = buy ? (limitPrice - mark) / mark : (mark - limitPrice) / mark;
    if (through > MARKETABLE_WARN) {
      if (postOnly) errors.push(`A post-only ${buy ? 'buy' : 'sell'} ${buy ? 'above' : 'below'} the mark (${fmt(mark)}) would fill straight away, so the exchange would cancel it.`);
      else warnings.push(`This limit is ${buy ? 'above' : 'below'} the mark (${fmt(mark)}), so it will fill straight away like a market order.`);
    }
  }
  if (mark && stopPrice) {
    if (buy && stopPrice <= mark) errors.push(`A buy stop triggers when the price rises: set it above the mark (${fmt(mark)}).`);
    if (!buy && stopPrice >= mark) errors.push(`A sell stop triggers when the price falls: set it below the mark (${fmt(mark)}).`);
  }
  for (const [label, p] of [['limit', limitPrice], ['trigger', stopPrice]] as const) {
    if (mark && p && Math.abs(p - mark) / mark > FAR_WARN) warnings.push(`The ${label} price is over ${FAR_WARN * 100}% from the mark (${fmt(mark)}). Check it isn't a typo.`);
  }

  // Take-profit and stop-loss.
  const reduceOnly = !!t.reduceOnly;
  const takeProfit = t.takeProfit ? toTick(t.takeProfit, q.tickSize) : null;
  const stopLoss = t.stopLoss ? toTick(t.stopLoss, q.tickSize) : null;
  if ((takeProfit || stopLoss) && t.type !== 'MARKET') errors.push('Take-profit and stop-loss can be added to market orders here. For a limit or stop order, add them from the position once it fills.');
  if ((takeProfit || stopLoss) && reduceOnly) errors.push('A closing (reduce-only) order can’t have its own take-profit or stop-loss.');
  if (refPrice && takeProfit && (buy ? takeProfit <= refPrice : takeProfit >= refPrice)) errors.push(`The take-profit must be ${buy ? 'above' : 'below'} the entry (about ${fmt(refPrice)}).`);
  if (refPrice && stopLoss && (buy ? stopLoss >= refPrice : stopLoss <= refPrice)) errors.push(`The stop-loss must be ${buy ? 'below' : 'above'} the entry (about ${fmt(refPrice)}).`);

  // Size.
  const step = q.qtyStep > 0 ? q.qtyStep : 1;
  const roundQty = (n: number) => Math.floor(n / step + 1e-9) * step;
  const perContract = refPrice ? refPrice * q.contractMultiplier : null; // USD value of one contract
  let qty = 0;
  if (t.size.mode === 'contracts') {
    qty = roundQty(t.size.value);
    if (qty !== t.size.value && qty > 0) warnings.push(`Rounded down to ${qty} ${qty === 1 ? 'contract' : 'contracts'}: ${q.symbol} trades in steps of ${step}.`);
  } else if (t.size.mode === 'usd') {
    if (perContract) qty = roundQty(t.size.value / perContract);
  } else {
    if (!stopLoss) errors.push('Sizing by risk needs a stop-loss: that’s where the risk is measured to.');
    else if (refPrice) {
      const lossPerContract = Math.abs(refPrice - stopLoss) * q.contractMultiplier;
      if (lossPerContract > 0) qty = roundQty((q.equityUsd * (t.size.value / 100)) / lossPerContract);
    }
  }
  const minQty = q.minQty > 0 ? q.minQty : step;
  if (qty < minQty && !errors.some((e) => e.startsWith('Sizing by risk'))) {
    const one = perContract ? ` (one contract is about $${fmt(perContract * minQty)})` : '';
    errors.push(`That's less than the smallest order: ${minQty} ${minQty === 1 ? 'contract' : 'contracts'}${one}.`);
  }

  // Leverage.
  const leverage = t.leverage ?? q.currentLeverage;
  if (t.leverage && q.maxLeverage && t.leverage > q.maxLeverage) errors.push(`${q.symbol} allows at most ${q.maxLeverage}× leverage.`);
  if (t.leverage && reduceOnly) warnings.push('Leverage doesn’t matter for a closing order; it isn’t changed.');

  // Reduce-only must actually reduce.
  if (reduceOnly) {
    const reduces = buy ? q.position < 0 : q.position > 0;
    if (!reduces) errors.push(q.position === 0 ? `There's no ${q.symbol} position to reduce.` : `A ${buy ? 'buy' : 'sell'} would add to your ${q.position > 0 ? 'long' : 'short'}, not reduce it.`);
    else if (qty > Math.abs(q.position)) warnings.push(`Only ${Math.abs(q.position)} ${Math.abs(q.position) === 1 ? 'contract is' : 'contracts are'} open; the exchange closes at most that.`);
  }

  const notionalUsd = perContract && qty ? Math.round(perContract * qty * 100) / 100 : null;
  const marginUsd = notionalUsd != null && leverage ? Math.round((notionalUsd / leverage) * 100) / 100 : null;
  const riskUsd = stopLoss && refPrice && qty ? Math.round(Math.abs(refPrice - stopLoss) * q.contractMultiplier * qty * 100) / 100 : null;
  if (!reduceOnly && marginUsd != null && q.availableUsd != null) {
    if (marginUsd > q.availableUsd) errors.push(`Not enough available balance: this needs about $${fmt(marginUsd)} of margin and $${fmt(q.availableUsd)} is free.`);
    else if (marginUsd > q.availableUsd * MARGIN_WARN) warnings.push(`This uses over ${MARGIN_WARN * 100}% of your available balance.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    symbol: q.symbol,
    side: t.side,
    type: t.type,
    qty,
    limitPrice,
    stopPrice,
    tif,
    postOnly,
    reduceOnly,
    takeProfit,
    stopLoss,
    leverage: leverage ?? null,
    currentLeverage: q.currentLeverage,
    refPrice: refPrice ?? null,
    notionalUsd,
    marginUsd,
    riskUsd,
    availableUsd: q.availableUsd,
    environment: q.environment,
  };
}
