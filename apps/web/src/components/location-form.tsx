'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { COUNTRIES } from '@/lib/countries';
import { locationApi, type PlaceSuggestion } from '@/lib/location-api';
import { MapPin, CaretDown, SpinnerGap } from '@phosphor-icons/react';

interface Props {
  initial?: { country?: string | null; city?: string | null; postalCode?: string | null };
  onSaved: () => void;
  /** When true, modal cannot be dismissed (blocking gate). */
  blocking?: boolean;
  title?: string;
  subtitle?: string;
  /** Button text — "Continue" in the first-run gate, "Save location" when editing. */
  submitLabel?: string;
}

const fieldClass =
  'mt-2 w-full h-11 rounded-lg bg-black/40 border border-white/[0.08] px-3.5 text-[13px] text-fg ' +
  'placeholder:text-fg-3/70 outline-none transition-all duration-200 ' +
  'hover:border-white/[0.14] focus:border-profit/50 focus:ring-2 focus:ring-profit/15';

const labelClass = 'text-[11px] font-medium tracking-wide text-fg-2';

function useDebouncedSuggest(
  kind: 'city' | 'postal',
  query: string,
  country: string,
  enabled: boolean,
) {
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || country.length !== 2 || query.trim().length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      locationApi
        .suggest(kind, query.trim(), country)
        .then(rows => {
          if (seq.current === id) setItems(rows);
        })
        .catch(() => {
          if (seq.current === id) setItems([]);
        })
        .finally(() => {
          if (seq.current === id) setLoading(false);
        });
    }, 280);
    return () => clearTimeout(t);
  }, [kind, query, country, enabled]);

  return { items, loading };
}

function SuggestList({
  open,
  loading,
  items,
  onPick,
  listId,
  emptyHint,
}: {
  open: boolean;
  loading: boolean;
  items: PlaceSuggestion[];
  onPick: (s: PlaceSuggestion) => void;
  listId: string;
  emptyHint: string;
}) {
  if (!open) return null;
  return (
    <ul
      id={listId}
      role="listbox"
      className="absolute z-20 left-0 right-0 top-[calc(100%+6px)] max-h-48 overflow-y-auto rounded-lg border border-white/[0.1] bg-[#141414] shadow-2xl py-1"
    >
      {loading && (
        <li className="px-3.5 py-2.5 text-[12px] text-fg-3 flex items-center gap-2">
          <SpinnerGap size={14} className="animate-spin" /> Searching…
        </li>
      )}
      {!loading && items.length === 0 && (
        <li className="px-3.5 py-2.5 text-[12px] text-fg-3">{emptyHint}</li>
      )}
      {!loading &&
        items.map(s => (
          <li key={s.id} role="option">
            <button
              type="button"
              className="w-full text-left px-3.5 py-2.5 text-[13px] text-fg hover:bg-white/[0.06] transition-colors"
              onMouseDown={e => e.preventDefault()}
              onClick={() => onPick(s)}
            >
              <span className="block truncate">{s.label}</span>
              {(s.city || s.postalCode) && (
                <span className="block text-[11px] text-fg-3 mt-0.5 truncate">
                  {[s.city, s.postalCode].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          </li>
        ))}
    </ul>
  );
}

export default function LocationForm({
  initial,
  onSaved,
  blocking = false,
  title = 'Where do you trade from?',
  subtitle = 'A quiet detail for product insights — country, city, and postal code. Takes a moment.',
  submitLabel = 'Continue',
}: Props) {
  const [country, setCountry] = useState(initial?.country?.toUpperCase() ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cityOpen, setCityOpen] = useState(false);
  const [postalOpen, setPostalOpen] = useState(false);
  const cityListId = useId();
  const postalListId = useId();

  const canSubmit = country.length === 2 && city.trim().length > 0 && postalCode.trim().length > 0;
  const countryReady = country.length === 2;

  const citySuggest = useDebouncedSuggest('city', city, country, cityOpen && countryReady);
  const postalSuggest = useDebouncedSuggest('postal', postalCode, country, postalOpen && countryReady);

  function applySuggestion(s: PlaceSuggestion) {
    if (s.country) setCountry(s.country.toUpperCase());
    if (s.city) setCity(s.city);
    if (s.postalCode) setPostalCode(s.postalCode);
    setCityOpen(false);
    setPostalOpen(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError('');
    try {
      await locationApi.update({
        country: country.toUpperCase(),
        city: city.trim(),
        postalCode: postalCode.trim(),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save location');
    } finally {
      setBusy(false);
    }
  }

  const fields = (
    <form onSubmit={submit} className="space-y-5" data-testid="location-form" autoComplete="off">
      <div>
        <label htmlFor="loc-country" className={labelClass}>Country</label>
        <div className="relative mt-2">
          <select
            id="loc-country"
            required
            value={country}
            onChange={e => {
              setCountry(e.target.value);
              setCityOpen(false);
              setPostalOpen(false);
            }}
            className={`${fieldClass} mt-0 appearance-none pr-10 cursor-pointer`}
            data-testid="location-country"
          >
            <option value="">Select country</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
          <CaretDown
            size={14}
            weight="bold"
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-fg-3"
            aria-hidden
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="relative">
          <label htmlFor="loc-city" className={labelClass}>City</label>
          <input
            id="loc-city"
            required
            value={city}
            onChange={e => {
              setCity(e.target.value);
              setCityOpen(true);
              setPostalOpen(false);
            }}
            onFocus={() => setCityOpen(true)}
            onBlur={() => setTimeout(() => setCityOpen(false), 150)}
            placeholder={countryReady ? 'Start typing…' : 'Select country first'}
            disabled={!countryReady}
            className={`${fieldClass} disabled:opacity-50`}
            data-testid="location-city"
            autoComplete="off"
            role="combobox"
            aria-expanded={cityOpen}
            aria-controls={cityListId}
            aria-autocomplete="list"
          />
          <SuggestList
            open={cityOpen && countryReady && city.trim().length >= 2}
            loading={citySuggest.loading}
            items={citySuggest.items}
            onPick={applySuggestion}
            listId={cityListId}
            emptyHint="No matching cities"
          />
        </div>
        <div className="relative">
          <label htmlFor="loc-postal" className={labelClass}>Postal / ZIP</label>
          <input
            id="loc-postal"
            required
            value={postalCode}
            onChange={e => {
              setPostalCode(e.target.value);
              setPostalOpen(true);
              setCityOpen(false);
            }}
            onFocus={() => setPostalOpen(true)}
            onBlur={() => setTimeout(() => setPostalOpen(false), 150)}
            placeholder={countryReady ? 'Start typing…' : 'Select country first'}
            disabled={!countryReady}
            className={`${fieldClass} disabled:opacity-50`}
            data-testid="location-postal"
            autoComplete="off"
            role="combobox"
            aria-expanded={postalOpen}
            aria-controls={postalListId}
            aria-autocomplete="list"
          />
          <SuggestList
            open={postalOpen && countryReady && postalCode.trim().length >= 2}
            loading={postalSuggest.loading}
            items={postalSuggest.items}
            onPick={applySuggestion}
            listId={postalListId}
            emptyHint="No matching postal codes"
          />
        </div>
      </div>

      {!countryReady && (
        <p className="text-[12px] text-fg-3 -mt-2">Pick a country to unlock city &amp; postal suggestions.</p>
      )}

      {error && (
        <p className="text-[13px] text-loss/90 bg-loss/10 border border-loss/20 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit || busy}
        className={
          'w-full h-11 rounded-lg text-[13px] font-semibold tracking-wide transition-all duration-200 ' +
          'disabled:opacity-40 disabled:cursor-not-allowed ' +
          (canSubmit && !busy
            ? 'bg-white text-black hover:bg-white/90 active:scale-[0.99]'
            : 'bg-white/15 text-fg-3')
        }
        data-testid="location-submit"
      >
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  );

  if (!blocking) {
    return <div className="space-y-1">{fields}</div>;
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-gate-title"
      data-testid="location-gate-modal"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" aria-hidden />
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 40%, rgba(8,196,101,0.07), transparent 70%)',
        }}
      />

      <div
        className="relative w-full max-w-[420px] rounded-2xl border border-white/[0.08] overflow-visible fade-up"
        style={{
          background: 'linear-gradient(165deg, #161616 0%, #0c0c0c 100%)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03) inset',
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(8,196,101,0.45), transparent)' }}
          aria-hidden
        />

        <div className="px-7 sm:px-8 pt-8 pb-7">
          <div className="flex justify-center mb-5">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(8,196,101,0.1)',
                boxShadow: '0 0 0 1px rgba(8,196,101,0.2)',
              }}
            >
              <MapPin size={22} weight="duotone" className="text-profit" />
            </div>
          </div>

          <div className="text-center mb-7">
            <h2
              id="location-gate-title"
              className="font-display font-bold text-[22px] sm:text-[24px] tracking-tight text-fg leading-tight"
            >
              {title}
            </h2>
            <p className="text-[13px] text-fg-3 mt-2.5 leading-relaxed max-w-[32ch] mx-auto">
              {subtitle}
            </p>
          </div>

          {fields}
        </div>
      </div>
    </div>
  );
}
