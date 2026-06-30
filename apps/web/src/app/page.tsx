'use client';

import Link from 'next/link';
import './landing.css';

export default function LandingPage() {
  return (
    <div className="landing-page">
      {/* Nav */}
      <header className="landing-nav">
        <div className="landing-wrap landing-nav-inner">
          <Link href="/" className="text-lg font-bold tracking-tight" style={{ color: '#e5e2e1' }}>
            TradinX
          </Link>
          <nav className="landing-nav-links">
            <a href="#" className="nav-link-active" style={{ fontSize: 14 }}>Home</a>
            <a href="#features" style={{ fontSize: 14, color: '#c4c5d6' }}>Features</a>
            <a href="#pricing" style={{ fontSize: 14, color: '#c4c5d6' }}>Pricing</a>
          </nav>
          <div className="landing-nav-actions">
            <Link href="/login" className="landing-btn-nav">Sign In</Link>
            <Link href="/signup" className="landing-btn-nav-cta">Get Started</Link>
          </div>
        </div>
      </header>

      <main className="landing-main">
        {/* ── Hero ── */}
        <section className="landing-hero">
          <div className="landing-glow" style={{ top: -120, left: -120 }} />
          <div className="landing-glow" style={{ top: '40%', right: -120 }} />

          <div className="landing-wrap landing-relative-z">
            <div className="landing-hero-copy">
              <div className="landing-badge">
                <span className="landing-text-primary" style={{ fontWeight: 600 }}>Psychology First</span>
                <span style={{ color: '#c4c5d6' }}>Identify Your Emotional Trading Triggers →</span>
              </div>

              <h1 className="landing-hero-title">
                Master Your <span className="landing-text-primary">Trading Psychology</span> with TradinX
              </h1>

              <p className="landing-hero-sub">
                Gain deep behavioral insights and eliminate revenge trading with automated MT5 journaling and advanced analytics designed for professional traders.
              </p>

              <div className="landing-hero-cta">
                <Link href="/signup" className="landing-btn-primary">
                  Get Started
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                </Link>
                <Link href="/login" className="landing-btn-secondary">View Demo</Link>
              </div>
            </div>

            {/* Dashboard preview */}
            <div className="landing-hero-preview">
              <div className="landing-glass" style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
                <div className="landing-preview-grid">
                  <div className="landing-preview-chart">
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
                      <div>
                        <h3 className="landing-h3">
                          XAUUSD <span style={{ color: '#c4c5d6', fontWeight: 400, fontSize: 16 }}>/ Gold Long</span>
                        </h3>
                        <p style={{ color: '#b8c4ff', fontWeight: 600, marginTop: 4 }}>
                          Win Rate: 68%{' '}
                          <span style={{ color: '#4ade80', fontSize: 14 }}>+4.2% Profit Factor</span>
                        </p>
                      </div>
                      <span style={{ fontSize: 12, color: '#c4c5d6' }}>Behavioral Score: 94/100</span>
                    </div>
                    <div className="landing-chart-bars">
                      <div className="landing-bar" style={{ height: '40%', background: '#f87171' }} />
                      <div className="landing-bar" style={{ height: '55%', background: '#4ade80' }} />
                      <div className="landing-bar" style={{ height: '65%', background: '#4ade80' }} />
                      <div className="landing-bar" style={{ height: '30%', background: '#f87171' }} />
                      <div className="landing-bar" style={{ height: '75%', background: '#4ade80' }} />
                      <div className="landing-bar" style={{ height: '85%', background: '#4ade80' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: '#8e909f', padding: '0 8px' }}>
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => <span key={d}>{d}</span>)}
                    </div>
                  </div>

                  <div className="landing-preview-sidebar">
                    <div className="landing-glass" style={{ padding: 20, background: 'rgba(42,42,42,0.5)' }}>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 12 }}>
                        <span style={{ color: '#b8c4ff', fontSize: 14, fontWeight: 600, borderBottom: '2px solid #b8c4ff', paddingBottom: 4 }}>Journal</span>
                        <span style={{ color: '#c4c5d6', fontSize: 14 }}>Replay</span>
                        <span style={{ color: '#c4c5d6', fontSize: 14 }}>Notes</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ padding: 16, background: '#201f1f', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                          <p style={{ fontSize: 12, color: '#c4c5d6', marginBottom: 8 }}>Trade Sentiment</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 18, fontWeight: 600 }}>Confident</span>
                            <span style={{ fontSize: 12, background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#b8c4ff' }}>psychology</span>
                              High R:R
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                          <div style={{ background: '#0033ad', padding: 8, borderRadius: '50%', border: '4px solid #0e0e0e' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>sync_alt</span>
                          </div>
                        </div>
                        <div style={{ padding: 16, background: '#201f1f', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                          <p style={{ fontSize: 12, color: '#c4c5d6', marginBottom: 8 }}>MT5 Account</p>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 18, fontWeight: 600 }}>Live-01</span>
                            <span style={{ fontSize: 12, color: '#4ade80', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 4 }}>Connected</span>
                          </div>
                        </div>
                        <button className="landing-btn-primary" style={{ width: '100%', marginTop: 4 }}>Analyze Session</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Mission ── */}
        <section className="landing-section landing-mission">
          <div className="landing-wrap">
            <p className="landing-tag">[ THE MISSION ]</p>
            <h2 className="landing-h2 landing-text-muted" style={{ maxWidth: 900, margin: '0 auto' }}>
              TRADINX IS THE NEXT-GEN ANALYTICS LAYER FOR MODERN TRADERS.{' '}
              <span style={{ color: '#e5e2e1' }}>IDENTIFY BIASES, REVIEW REPLAYS, AND MASTER THE MARKET.</span>
            </h2>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="landing-section">
          <div className="landing-wrap">
            <div className="landing-grid-2">
              <div className="landing-glass" style={{ padding: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
                  <div>
                    <p style={{ fontSize: 12, color: '#c4c5d6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Session Psychology</p>
                    <p className="landing-h3">Optimal Discipline</p>
                  </div>
                  <div style={{ background: 'rgba(184,196,255,0.15)', padding: 12, borderRadius: '50%' }}>
                    <span className="material-symbols-outlined landing-text-primary">psychology</span>
                  </div>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 8 }}>
                  <div style={{ height: '100%', width: '80%', background: '#b8c4ff', borderRadius: 4 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#c4c5d6', marginBottom: 24 }}>
                  <span>Discipline Score</span><span>80/100</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4ade80', fontSize: 14, fontWeight: 500 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>verified_user</span>
                  AUTOMATED MT5 LOGGING
                </div>
              </div>

              <div>
                <p className="landing-tag">[ FEATURE ]</p>
                <h2 className="landing-h2" style={{ marginBottom: 32 }}>SEAMLESS MT5<br />INTEGRATION</h2>
                <div style={{ display: 'flex', gap: 20, marginBottom: 32 }}>
                  <span className="material-symbols-outlined landing-text-primary" style={{ fontSize: 32, flexShrink: 0 }}>bolt</span>
                  <div>
                    <h3 className="landing-h3" style={{ marginBottom: 8 }}>AUTOMATED JOURNALING</h3>
                    <p className="landing-text-muted">
                      Stop manually entering every trade. TradinX connects directly to MetaTrader 5, importing your entries, exits, and screenshots instantly.
                    </p>
                  </div>
                </div>
                <Link href="/signup" className="landing-btn-secondary" style={{ display: 'block', textAlign: 'center', background: '#353534' }}>
                  SKIP MANUAL WORK
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Behavioral ── */}
        <section className="landing-section" style={{ background: '#0e0e0e' }}>
          <div className="landing-watermark">BEHAVIORAL AI</div>
          <div className="landing-wrap landing-relative-z">
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <p className="landing-tag">[ ANALYSIS ]</p>
              <h2 className="landing-h2">IDENTIFY YOUR<br />EMOTIONAL PATTERNS</h2>
            </div>
            <div className="landing-grid-3">
              {[
                { icon: 'warning', title: 'Revenge Trading Detector', desc: 'Automatically flags clusters of trades following a loss.', highlight: true },
                { icon: 'timer', title: 'FOMO Analytics', desc: 'Compares entry precision against signal timing.', highlight: false },
                { icon: 'query_stats', title: 'Profit Taking Habits', desc: 'Analyzes if you cut winners too early or let losers run.', highlight: false },
              ].map(f => (
                <div key={f.title} className="landing-glass" style={{ padding: 24, borderColor: f.highlight ? 'rgba(184,196,255,0.3)' : undefined, background: f.highlight ? 'rgba(184,196,255,0.05)' : undefined }}>
                  <span className={`material-symbols-outlined ${f.highlight ? 'landing-text-primary' : ''}`} style={{ marginBottom: 16, display: 'block', color: f.highlight ? undefined : '#c4c5d6' }}>{f.icon}</span>
                  <h3 className="landing-h3" style={{ marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ fontSize: 14, color: '#c4c5d6', lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Trade Replay ── */}
        <section className="landing-section">
          <div className="landing-wrap">
            <div className="landing-grid-2">
              <div className="landing-glass" style={{ padding: 40 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
                  <div>
                    <p style={{ fontSize: 12, color: '#c4c5d6', textTransform: 'uppercase' }}>Edge Discovery</p>
                    <p className="landing-h3">PERFORMANCE</p>
                  </div>
                  <span style={{ fontSize: 12, background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: 4 }}>ALL TIME</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
                  <div style={{ width: 180, height: 180, borderRadius: '50%', border: '12px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '12px solid #b8c4ff', borderTopColor: 'transparent', borderRightColor: 'transparent', transform: 'rotate(-45deg)' }} />
                    <span style={{ fontSize: 12, color: '#c4c5d6' }}>WIN RATE</span>
                    <span style={{ fontSize: 36, fontWeight: 700 }}>62.5%</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ background: '#201f1f', padding: 16, borderRadius: 12 }}>
                    <p style={{ fontSize: 12, color: '#c4c5d6', marginBottom: 4 }}>AVG R:R</p>
                    <p className="landing-h3">1:2.4</p>
                    <span style={{ fontSize: 12, color: '#4ade80' }}>+ 12% Efficiency</span>
                  </div>
                  <div style={{ background: '#201f1f', padding: 16, borderRadius: 12 }}>
                    <p style={{ fontSize: 12, color: '#c4c5d6', marginBottom: 4 }}>PROFIT FACTOR</p>
                    <p className="landing-h3">2.82</p>
                    <span style={{ fontSize: 12, color: '#c4c5d6' }}>System Stability</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="landing-tag">[ CAPABILITIES ]</p>
                <h2 className="landing-h2" style={{ marginBottom: 32 }}>TRADE REPLAY<br />&amp; REVIEW</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="landing-glass" style={{ padding: 20, borderColor: 'rgba(184,196,255,0.3)' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                      <span className="material-symbols-outlined landing-text-primary">play_circle</span>
                      <h4 className="landing-h3" style={{ fontSize: 15 }}>CANDLE-BY-CANDLE REVIEW</h4>
                    </div>
                    <p style={{ fontSize: 14, color: '#c4c5d6', lineHeight: 1.6 }}>Relive your trades candle-by-candle to see exactly what you were thinking.</p>
                  </div>
                  {['AUTO-CHART CAPTURE', 'PRE & POST-TRADE NOTES', 'EMOTIONAL TAGGING'].map(t => (
                    <div key={t} style={{ padding: 20, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, color: '#c4c5d6' }}>{t}</h4>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Recent Trades ── */}
        <section className="landing-section" style={{ background: '#0e0e0e' }}>
          <div className="landing-watermark" style={{ opacity: 0.02 }}>PERFORMANCE</div>
          <div className="landing-wrap landing-relative-z">
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 className="landing-h3">
                RECENT TRADES <span style={{ color: '#c4c5d6', fontSize: 14, fontWeight: 400, marginLeft: 8 }}>MT5 SYNCED</span>
              </h2>
            </div>
            <div className="landing-glass" style={{ overflow: 'hidden' }}>
              {[
                { sym: 'XAUUSD', side: 'Buy', desc: 'Gold / US Dollar', pnl: '+$1,240.00', rr: 'R:R 1:3.2', pos: true, tags: ['High Quality', 'Trend Follow'] },
                { sym: 'NAS100', side: 'Sell', desc: 'Nasdaq 100', pnl: '-$450.00', rr: 'R:R 1:1.5', pos: false, tags: ['Impatience', 'News Fade'] },
                { sym: 'EURUSD', side: 'Buy', desc: 'Euro / US Dollar', pnl: '+$680.00', rr: 'R:R 1:2.1', pos: true, tags: ['Disciplined', 'Breakout'] },
              ].map(t => (
                <div key={t.sym} className="landing-trade-row">
                  <div>
                    <p className="landing-h3" style={{ fontSize: 15 }}>{t.sym} <span style={{ color: '#c4c5d6', fontWeight: 400, fontSize: 13 }}>{t.side}</span></p>
                    <p style={{ fontSize: 12, color: '#c4c5d6' }}>{t.desc}</p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {t.tags.map(tag => (
                      <span key={tag} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: '#c4c5d6' }}>{tag}</span>
                    ))}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 600 }}>{t.pnl}</p>
                    <p style={{ fontSize: 12, color: t.pos ? '#4ade80' : '#f87171' }}>{t.rr}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="landing-section landing-mission">
          <div className="landing-wrap">
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <p className="landing-tag">[ PRICING ]</p>
              <h2 className="landing-h2">SIMPLE PLANS FOR<br />SERIOUS TRADERS</h2>
            </div>
            <div className="landing-grid-2" style={{ maxWidth: 900, margin: '0 auto' }}>
              <div className="landing-glass" style={{ padding: 40 }}>
                <p style={{ fontSize: 14, color: '#c4c5d6', marginBottom: 24 }}>STARTER</p>
                <p style={{ fontSize: 40, fontWeight: 700, marginBottom: 8 }}>FREE</p>
                <p style={{ fontSize: 14, color: '#c4c5d6', marginBottom: 32 }}>Essential journaling for developing traders.</p>
                <Link href="/signup" className="landing-btn-secondary" style={{ display: 'block', textAlign: 'center' }}>GET STARTED</Link>
              </div>
              <div className="landing-glass" style={{ padding: 40, borderColor: 'rgba(184,196,255,0.3)', background: 'rgba(184,196,255,0.05)' }}>
                <p style={{ fontSize: 14, color: '#b8c4ff', marginBottom: 24 }}>PRO TRADER</p>
                <p style={{ fontSize: 40, fontWeight: 700, marginBottom: 8 }}>$19<span style={{ fontSize: 14, fontWeight: 400, color: '#c4c5d6' }}>/mo</span></p>
                <p style={{ fontSize: 14, color: '#c4c5d6', marginBottom: 32 }}>Advanced edge discovery for pros.</p>
                <Link href="/signup" className="landing-btn-primary" style={{ display: 'block', textAlign: 'center' }}>UPGRADE NOW</Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="landing-section-tight" style={{ textAlign: 'center' }}>
          <div className="landing-wrap">
            <h2 className="landing-h2" style={{ marginBottom: 24 }}>JOURNAL STARTS HERE</h2>
            <p className="landing-text-muted" style={{ maxWidth: 480, margin: '0 auto 32px' }}>
              Join traders mastering their psychology with TradinX.
            </p>
            <Link href="/signup" className="landing-btn-primary">START JOURNALING</Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap">
          <div className="landing-grid-2" style={{ marginBottom: 48 }}>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>TradinX</p>
              <p className="landing-h2" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>MASTER YOUR MIND.<br />RULE THE MARKET.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
              <div>
                <p style={{ fontWeight: 600, marginBottom: 16, fontSize: 14 }}>PLATFORM</p>
                {['Journal', 'Pricing', 'Support'].map(l => (
                  <p key={l} style={{ fontSize: 14, color: '#c4c5d6', marginBottom: 8 }}><a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>{l}</a></p>
                ))}
              </div>
              <div>
                <p style={{ fontWeight: 600, marginBottom: 16, fontSize: 14 }}>RESOURCES</p>
                {['Help Center', 'Privacy', 'Terms'].map(l => (
                  <p key={l} style={{ fontSize: 14, color: '#c4c5d6', marginBottom: 8 }}><a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>{l}</a></p>
                ))}
              </div>
            </div>
          </div>
          <div style={{ paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <p style={{ fontSize: 12, color: '#8e909f' }}>© 2024 TradinX. All rights reserved.</p>
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ fontSize: 12, color: '#c4c5d6', background: 'none', border: 'none', cursor: 'pointer' }}>
              BACK TO TOP ↑
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
