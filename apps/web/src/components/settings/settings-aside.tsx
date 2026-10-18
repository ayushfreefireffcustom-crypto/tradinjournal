// Right-hand companion column for the Settings page: how each alert channel
// reaches you, and a short privacy reassurance.
const I = {
  push: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M13 3L5 14h6l-1 7 8-11h-6z" /></svg>,
  mail: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>,
  doc: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 3h9l3 3v15H6z" /><path d="M9 11h6M9 15h6" /></svg>,
};
const CHANNELS = [
  { icon: I.push, title: 'Real-time push', cadence: 'Instant', desc: 'Price alerts and high-impact events the moment they fire.' },
  { icon: I.mail, title: 'Email digest', cadence: 'Daily', desc: 'Tomorrow’s calendar and the headlines for your markets.' },
  { icon: I.doc, title: 'Weekly review', cadence: 'Saturday', desc: 'Your week in one note, written from your real trades.' },
];

export default function SettingsAside() {
  return (
    <aside className="st-aside" data-testid="settings-aside">
      <section className="v3-card st-card">
        <div className="st-hd"><h3>How alerts reach you</h3></div>
        <div className="st-ch">
          {CHANNELS.map(c => (
            <div key={c.title}><span className="ic">{c.icon}</span><div><b>{c.title} <em className="v3-pill v">{c.cadence}</em></b><p>{c.desc}</p></div></div>
          ))}
        </div>
      </section>
      <section className="st-priv">
        <b>Private &amp; read-only</b>
        <p>TRADElogs only ever reads your MT5 history — it never places trades or touches your funds.</p>
      </section>
    </aside>
  );
}
