'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { COUNTRIES } from '@/lib/countries';
import { locationApi, type PlaceSuggestion } from '@/lib/location-api';
import { MapPin, SpinnerGap } from '@phosphor-icons/react';
import '@/styles/v6/tokens.css';
import '@/styles/v6/components.css';
import '@/styles/v6/dialogs.css';

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
    <ul id={listId} role="listbox" className="ac-suggest">
      {loading && (
        <li className="ac-suggest-note">
          <SpinnerGap size={14} className="x-spin" /> Searching…
        </li>
      )}
      {!loading && items.length === 0 && <li className="ac-suggest-note">{emptyHint}</li>}
      {!loading &&
        items.map(s => (
          <li key={s.id} role="option" aria-selected={false}>
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onPick(s)}>
              <span>{s.label}</span>
              {(s.city || s.postalCode) && <small>{[s.city, s.postalCode].filter(Boolean).join(' · ')}</small>}
            </button>
          </li>
        ))}
    </ul>
  );
}

// The blocking gate's unsaved answers. The gate lives in the app shell, which
// re-mounts when the page underneath redirects (a new user's /dashboard goes to
// /brokers), so keep what they typed instead of wiping it mid-form.
let gateDraft: { country: string; city: string; postalCode: string } | null = null;

export default function LocationForm({
  initial,
  onSaved,
  blocking = false,
  title = 'Where do you trade from?',
  subtitle = 'A quiet detail for product insights: country, city and postal code. Takes a moment.',
  submitLabel = 'Continue',
}: Props) {
  const draft = blocking ? gateDraft : null;
  const [country, setCountry] = useState(draft?.country ?? initial?.country?.toUpperCase() ?? '');
  const [city, setCity] = useState(draft?.city ?? initial?.city ?? '');
  const [postalCode, setPostalCode] = useState(draft?.postalCode ?? initial?.postalCode ?? '');
  useEffect(() => { if (blocking) gateDraft = { country, city, postalCode }; }, [blocking, country, city, postalCode]);
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
      if (blocking) gateDraft = null;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save location');
    } finally {
      setBusy(false);
    }
  }

  const fields = (
    <form onSubmit={submit} className="ac-loc" data-testid="location-form" autoComplete="off">
      <div className="x-field">
        <label htmlFor="loc-country">Country</label>
        <select
          id="loc-country"
          required
          value={country}
          onChange={e => {
            setCountry(e.target.value);
            setCityOpen(false);
            setPostalOpen(false);
          }}
          className="x-select"
          data-testid="location-country"
        >
          <option value="">Select country</option>
          {COUNTRIES.map(c => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="ac-row2">
        <div className="x-field ac-loc-f">
          <label htmlFor="loc-city">City</label>
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
            className="x-input"
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
        <div className="x-field ac-loc-f">
          <label htmlFor="loc-postal">Postal / ZIP</label>
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
            className="x-input"
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

      {!countryReady && <p className="ac-loc-hint">Pick a country to unlock city and postal suggestions.</p>}

      {error && (
        <div className="x-banner x-banner--err" role="alert"><span>{error}</span></div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || busy}
        className={`x-btn x-btn--hi ${blocking ? 'x-btn--lg x-btn--full' : 'ac-loc-save'}`}
        data-testid="location-submit"
      >
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  );

  if (!blocking) return fields;

  return (
    <div className="v6 ac-portal">
      <div className="x-dialog-scrim ac-loc-scrim" role="dialog" aria-modal="true" aria-labelledby="location-gate-title" data-testid="location-gate-modal">
        <div className="x-dialog ac-loc-dlg">
          <span className="ac-loc-ic" aria-hidden><MapPin size={22} weight="duotone" /></span>
          <h2 id="location-gate-title">{title}</h2>
          <p className="ac-dlg-msg ac-loc-sub">{subtitle}</p>
          {fields}
        </div>
      </div>
    </div>
  );
}
