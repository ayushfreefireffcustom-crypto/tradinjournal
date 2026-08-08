// Pure prompt builders for the macro assistant (no I/O).
import type { MacroState } from '@tradinjournal/contracts';

export const NFA_DISCLAIMER =
  'This is not financial advice. Educational macro analysis only — do your own research.';

export const PERSONALIZED_REFUSAL =
  'I can only discuss the live macro dashboard numbers and general market context. I cannot give personalized investment advice, portfolio instructions, or guaranteed predictions.';

export function buildSystemPrompt(state: MacroState): string {
  const indicatorNames = state.macro.map(m => m.label || m.key).join(', ') || '(none ingested yet)';
  return [
    'You are IITianMacro / TradinJournal Macro AI — a macro analyst assistant.',
    'Answer ONLY using the JSON dashboard state provided below.',
    'Cite indicators and assets by name when you use their values.',
    'If the state lacks data needed to answer, say what is missing.',
    'Refuse personalized advice, buy/sell recommendations for a specific person, or promises of returns.',
    `Known indicators in state: ${indicatorNames}.`,
    `Always end with: ${NFA_DISCLAIMER}`,
    '',
    'DASHBOARD_STATE_JSON:',
    JSON.stringify(state),
  ].join('\n');
}

export function templateFallback(question: string, state: MacroState): string {
  const regime = state.regime?.label ?? 'Unclear';
  const top = state.bias.slice().sort((a, b) => b.score - a.score)[0];
  const indCount = state.macro.length;
  return [
    `The AI desk is unavailable right now — here's a quick read from the live dashboard for: "${question.trim().slice(0, 120)}"`,
    '',
    `Regime: ${regime}. Indicators loaded: ${indCount}. Engine: ${state.engineVer}.`,
    top
      ? `Highest bias: ${top.asset} at ${top.score} (${top.label}). Supporting: ${top.supporting.join(', ') || 'n/a'}.`
      : 'No bias scores available yet.',
    '',
    NFA_DISCLAIMER,
  ].join('\n');
}

export function looksPersonalized(q: string): boolean {
  const s = q.toLowerCase();
  return /\b(my portfolio|tell me what to buy|should i buy|should i sell|guaranteed|double my|invest my life)\b/.test(
    s,
  );
}
