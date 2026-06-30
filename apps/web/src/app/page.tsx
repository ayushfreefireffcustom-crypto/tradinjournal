"use client";
import Link from "next/link";

export default function Page() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-on-surface font-sora overflow-x-hidden">

      {/* ── NAV ── */}
      <nav className="fixed top-0 w-full z-50 h-[72px] border-b border-white/5"
        style={{ background: "rgba(13,13,13,0.85)", backdropFilter: "blur(20px)" }}>
        <div className="max-w-[1280px] mx-auto px-6 md:px-16 h-full flex items-center justify-between">
          <span className="text-xl font-bold tracking-tighter text-white">TradinX</span>
          <div className="hidden md:flex items-center gap-8">
            <a className="text-sm nav-link-active" href="#">Home</a>
            <a className="text-sm text-on-surface-variant hover:text-white transition-colors" href="#">Features</a>
            <a className="text-sm text-on-surface-variant hover:text-white transition-colors" href="#">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-on-surface-variant hover:text-white px-4 py-2 transition-colors">Sign In</Link>
            <Link href="/signup" className="text-sm font-semibold bg-primary-container text-white px-5 py-2 rounded-lg hover:opacity-90 transition-all active:scale-95">Get Started</Link>
          </div>
        </div>
      </nav>

      <main className="pt-[72px]">

        {/* ── HERO ── */}
        <section className="relative min-h-screen flex flex-col items-center justify-center py-24 px-6 md:px-16 overflow-hidden">
          {/* Glow orbs */}
          <div className="pointer-events-none absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-30"
            style={{ background: "radial-gradient(circle, rgba(0,51,173,0.4) 0%, transparent 70%)", filter: "blur(60px)" }} />
          <div className="pointer-events-none absolute top-1/2 -right-40 w-[400px] h-[400px] rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, rgba(0,51,173,0.4) 0%, transparent 70%)", filter: "blur(60px)" }} />

          {/* Hero copy */}
          <div className="relative z-10 text-center max-w-4xl mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 mb-8 text-xs">
              <span className="text-primary font-semibold">Psychology First</span>
              <span className="text-on-surface-variant">Identify Your Emotional Trading Triggers →</span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight tracking-tight mb-6">
              Master Your{" "}
              <span className="text-primary">Trading Psychology</span>{" "}
              with TradinX
            </h1>
            <p className="text-lg text-on-surface-variant max-w-2xl mx-auto mb-10 leading-relaxed">
              Gain deep behavioral insights and eliminate revenge trading with automated MT5 journaling and advanced analytics designed for professional traders.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup"
                className="flex items-center justify-center gap-2 px-8 py-4 bg-primary-container text-white rounded-xl font-semibold text-base group hover:shadow-[0_0_40px_rgba(0,51,173,0.35)] transition-all active:scale-95">
                Get Started
                <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </Link>
              <button className="px-8 py-4 rounded-xl border border-white/15 text-base font-semibold hover:bg-white/5 transition-all">
                View Demo
              </button>
            </div>
          </div>

          {/* Dashboard preview card */}
          <div className="relative z-10 w-full max-w-5xl">
            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
              style={{ background: "rgba(20,20,28,0.8)", backdropFilter: "blur(20px)" }}>
              <div className="p-6 md:p-8 flex flex-col md:flex-row gap-8">
                {/* Chart area */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-xl font-semibold mb-1">XAUUSD <span className="text-on-surface-variant text-sm font-normal">/ Gold Long</span></h3>
                      <p className="text-primary text-sm font-medium">Win Rate: 68% <span className="text-green-400 ml-2">+4.2% Profit Factor</span></p>
                    </div>
                    <span className="text-xs text-on-surface-variant bg-white/5 px-3 py-1 rounded-lg">Behavioral Score: 94/100</span>
                  </div>
                  <div className="h-48 bg-surface-container-low rounded-xl relative overflow-hidden flex items-end justify-around px-6 pb-10 gap-2">
                    <div className="w-3 bg-red-400/80 rounded-t" style={{ height: "55%" }} />
                    <div className="w-3 bg-green-400/80 rounded-t" style={{ height: "70%" }} />
                    <div className="w-3 bg-green-400/80 rounded-t" style={{ height: "85%" }} />
                    <div className="w-3 bg-red-400/80 rounded-t" style={{ height: "40%" }} />
                    <div className="w-3 bg-green-400/80 rounded-t" style={{ height: "95%" }} />
                    <div className="w-3 bg-green-400/80 rounded-t" style={{ height: "100%" }} />
                    <div className="absolute bottom-3 left-6 right-6 flex justify-between text-xs text-on-surface-variant">
                      <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span>
                    </div>
                  </div>
                </div>
                {/* Sidebar */}
                <div className="w-full md:w-72 shrink-0 rounded-xl border border-white/8 p-5"
                  style={{ background: "rgba(30,30,40,0.6)" }}>
                  <div className="flex gap-4 mb-5 border-b border-white/10 pb-4 text-sm">
                    <button className="text-primary border-b-2 border-primary pb-1 font-semibold">Journal</button>
                    <button className="text-on-surface-variant">Replay</button>
                    <button className="text-on-surface-variant">Notes</button>
                  </div>
                  <div className="space-y-3">
                    <div className="p-3 bg-white/5 rounded-lg border border-white/8">
                      <label className="block text-xs text-on-surface-variant mb-1">Trade Sentiment</label>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">Confident</span>
                        <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded text-xs">
                          <span className="material-symbols-outlined text-primary" style={{ fontSize: "14px" }}>psychology</span>
                          High R:R
                        </span>
                      </div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg border border-white/8">
                      <label className="block text-xs text-on-surface-variant mb-1">MT5 Account</label>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">Live-01</span>
                        <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded text-xs">
                          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>terminal</span>
                          Connected
                        </span>
                      </div>
                    </div>
                    <button className="w-full bg-primary-container text-white py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition-all">
                      Analyze Session
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── MISSION ── */}
        <section className="py-24 border-y border-white/5" style={{ background: "#0d0d0d" }}>
          <div className="max-w-[1280px] mx-auto px-6 md:px-16 text-center">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-on-surface-variant mb-4">[ The Mission ]</p>
            <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold leading-tight max-w-4xl mx-auto">
              <span className="text-on-surface-variant">TradinX is the next-gen analytics layer for modern traders.</span>{" "}
              <span className="text-white">Identify biases, review replays, and master the market.</span>
            </h2>
          </div>
        </section>

        {/* ── FEATURE: MT5 INTEGRATION ── */}
        <section className="py-28 px-6 md:px-16" style={{ background: "#0a0a0a" }}>
          <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Card */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl opacity-30"
                style={{ background: "radial-gradient(circle, rgba(0,51,173,0.3) 0%, transparent 70%)", filter: "blur(30px)" }} />
              <div className="relative rounded-2xl border border-white/10 p-8"
                style={{ background: "rgba(20,20,28,0.8)", backdropFilter: "blur(16px)" }}>
                <div className="flex justify-between items-start mb-10">
                  <div>
                    <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-1">Session Psychology</p>
                    <p className="text-xl font-semibold">Optimal Discipline</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary" style={{ fontSize: "20px" }}>brain</span>
                  </div>
                </div>
                <div className="mb-6">
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-primary rounded-full" style={{ width: "80%" }} />
                  </div>
                  <div className="flex justify-between text-xs text-on-surface-variant">
                    <span>Discipline Score</span><span>80/100</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-green-400 text-xs font-semibold">
                  <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>verified_user</span>
                  AUTOMATED MT5 LOGGING
                </div>
              </div>
            </div>
            {/* Text */}
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-4">[ Feature ]</p>
              <h2 className="text-3xl md:text-5xl font-bold leading-tight mb-8">Seamless MT5<br />Integration</h2>
              <div className="flex gap-5 items-start mb-6">
                <span className="material-symbols-outlined text-primary text-3xl shrink-0">bolt</span>
                <div>
                  <h4 className="text-lg font-semibold mb-2">Automated Journaling</h4>
                  <p className="text-on-surface-variant leading-relaxed text-sm">
                    Stop manually entering every trade. TradinX connects directly to MetaTrader 5, importing your entries, exits, and screenshots instantly so you can focus on the "why," not the "what."
                  </p>
                </div>
              </div>
              <button className="w-full py-4 rounded-xl border border-white/10 font-semibold text-sm hover:bg-white/5 transition-all text-on-surface-variant hover:text-white">
                SKIP MANUAL WORK
              </button>
            </div>
          </div>
        </section>

        {/* ── BEHAVIORAL ANALYTICS ── */}
        <section className="py-28 px-6 md:px-16 relative overflow-hidden" style={{ background: "#0d0d0d" }}>
          <div className="max-w-[1280px] mx-auto">
            <div className="text-center mb-16 relative z-10">
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-4">[ Analysis ]</p>
              <h2 className="text-3xl md:text-5xl font-bold leading-tight">Identify Your<br />Emotional Patterns</h2>
            </div>
            {/* Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <span className="text-white font-black uppercase leading-none" style={{ fontSize: "clamp(4rem,15vw,10rem)", opacity: 0.025 }}>BEHAVIORAL AI</span>
            </div>
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: "warning", title: "Revenge Trading Detector", desc: "Automatically flags clusters of trades following a loss to identify emotional chasing.", highlight: true },
                { icon: "timer", title: "FOMO Analytics", desc: "Compares entry precision against signal timing to measure patience levels.", highlight: false },
                { icon: "query_stats", title: "Profit Taking Habits", desc: "Analyzes if you're cutting winners too early or letting losers run based on your plan.", highlight: false },
              ].map(({ icon, title, desc, highlight }) => (
                <div key={title} className="rounded-xl border p-6"
                  style={{
                    background: highlight ? "rgba(0,51,173,0.08)" : "rgba(20,20,28,0.6)",
                    backdropFilter: "blur(12px)",
                    borderColor: highlight ? "rgba(0,51,173,0.3)" : "rgba(255,255,255,0.08)"
                  }}>
                  <span className={`material-symbols-outlined mb-4 block text-2xl ${highlight ? "text-primary" : "text-on-surface-variant"}`}>{icon}</span>
                  <h4 className="text-base font-semibold mb-2">{title}</h4>
                  <p className="text-on-surface-variant text-sm leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PERFORMANCE / TRADE REPLAY ── */}
        <section className="py-28 px-6 md:px-16 relative overflow-hidden" style={{ background: "#0a0a0a" }}>
          <div className="pointer-events-none absolute top-0 right-0 w-[400px] h-[400px] rounded-full opacity-15"
            style={{ background: "radial-gradient(circle, rgba(0,51,173,0.5) 0%, transparent 70%)", filter: "blur(60px)" }} />
          <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Win-rate card */}
            <div className="rounded-2xl border border-white/10 p-8"
              style={{ background: "rgba(20,20,28,0.8)", backdropFilter: "blur(16px)" }}>
              <div className="flex justify-between items-center mb-8">
                <div>
                  <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-0.5">Edge Discovery Engine</p>
                  <h4 className="text-lg font-semibold">Performance</h4>
                </div>
                <span className="text-xs bg-white/5 px-3 py-1 rounded-lg text-on-surface-variant">All Time</span>
              </div>
              <div className="flex justify-center mb-8">
                <div className="relative w-48 h-48">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#b8c4ff" strokeWidth="12"
                      strokeDasharray="314" strokeDashoffset="118" strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Win Rate</p>
                    <p className="text-4xl font-bold tracking-tight">62.5%</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-container rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-xs text-on-surface-variant">Avg R:R</span>
                  </div>
                  <p className="text-xl font-bold">1:2.4</p>
                  <span className="text-green-400 text-xs">+ 12% Efficiency</span>
                </div>
                <div className="bg-surface-container rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-tertiary" />
                    <span className="text-xs text-on-surface-variant">Profit Factor</span>
                  </div>
                  <p className="text-xl font-bold">2.82</p>
                  <span className="text-on-surface-variant text-xs">System Stability</span>
                </div>
              </div>
            </div>

            {/* Trade replay */}
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-4">[ Capabilities ]</p>
              <h2 className="text-3xl md:text-5xl font-bold leading-tight mb-8">Trade Replay<br />&amp; Review</h2>
              <div className="space-y-3">
                {[
                  { icon: "play_circle", title: "Candle-by-Candle Review", desc: "Relive your trades candle-by-candle to see exactly what you were thinking and how the market reacted.", open: true },
                  { icon: "camera_alt", title: "Auto-Chart Capture", desc: "", open: false },
                  { icon: "history_edu", title: "Pre & Post-Trade Notes", desc: "", open: false },
                  { icon: "psychology_alt", title: "Emotional Tagging", desc: "", open: false },
                ].map(({ icon, title, desc, open }) => (
                  <div key={title}
                    className={`rounded-xl border p-5 ${open ? "border-primary/30" : "border-white/8"}`}
                    style={{ background: open ? "rgba(0,51,173,0.06)" : "transparent" }}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className={`material-symbols-outlined ${open ? "text-primary" : "text-on-surface-variant"}`} style={{ fontSize: "20px" }}>{icon}</span>
                        <span className={`text-sm font-semibold uppercase tracking-wide ${open ? "text-white" : "text-on-surface-variant"}`}>{title}</span>
                      </div>
                      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "20px" }}>{open ? "expand_less" : "expand_more"}</span>
                    </div>
                    {open && desc && <p className="text-on-surface-variant text-sm mt-3 leading-relaxed">{desc}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── RECENT TRADES ── */}
        <section className="py-28 px-6 md:px-16 relative" style={{ background: "#0d0d0d" }}>
          {/* Watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
            <span className="text-white font-black uppercase" style={{ fontSize: "clamp(4rem,15vw,10rem)", opacity: 0.025, lineHeight: 1 }}>PERFORMANCE</span>
          </div>
          <div className="max-w-[1280px] mx-auto relative z-10">
            <div className="flex justify-between items-center mb-8 border-b border-white/8 pb-6">
              <h3 className="text-xl font-semibold">Recent Trades <span className="text-on-surface-variant text-sm font-normal ml-3">MT5 Synced</span></h3>
              <div className="bg-white/5 p-1 rounded-lg flex text-xs">
                <button className="px-4 py-1.5 rounded-md bg-white/10 font-semibold">Week</button>
                <button className="px-4 py-1.5 text-on-surface-variant">Month</button>
              </div>
            </div>
            <div className="space-y-1">
              {[
                { symbol: "XAUUSD", dir: "Buy", color: "#b8c4ff", letter: "X", tag1: "High Quality", tag1c: "green", tag2: "Trend Follow", pnl: "+$1,240.00", rr: "R:R 1:3.2", pos: true },
                { symbol: "NAS100",  dir: "Sell", color: "#f97316", letter: "N", tag1: "Impatience",  tag1c: "red",   tag2: "News Fade",   pnl: "-$450.00",  rr: "R:R 1:1.5", pos: false },
                { symbol: "EURUSD",  dir: "Buy",  color: "#60a5fa", letter: "E", tag1: "Disciplined", tag1c: "green", tag2: "Breakout",     pnl: "+$680.00",  rr: "R:R 1:2.1", pos: true },
              ].map(({ symbol, dir, color, letter, tag1, tag1c, tag2, pnl, rr, pos }) => (
                <div key={symbol} className="grid grid-cols-12 gap-4 p-4 items-center rounded-xl hover:bg-white/4 transition-colors border-b border-white/5 cursor-pointer">
                  <div className="col-span-1">
                    <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: "20px" }}>bookmark</span>
                  </div>
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                      style={{ background: `${color}20`, color }}>
                      {letter}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{symbol} <span className="text-on-surface-variant text-xs font-normal">{dir}</span></p>
                      <p className="text-on-surface-variant text-xs">{symbol === "XAUUSD" ? "Gold / US Dollar" : symbol === "NAS100" ? "Nasdaq 100" : "Euro / US Dollar"}</p>
                    </div>
                  </div>
                  <div className="col-span-4 flex items-center justify-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${tag1c === "green" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>{tag1}</span>
                    <span className="px-2 py-0.5 rounded text-xs bg-white/5 text-on-surface-variant">{tag2}</span>
                  </div>
                  <div className="col-span-3 text-right">
                    <p className={`font-bold text-sm ${pos ? "text-green-400" : "text-red-400"}`}>{pnl}</p>
                    <p className="text-on-surface-variant text-xs">{rr}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-center mt-10">
              <button className="flex items-center gap-2 text-on-surface-variant hover:text-white transition-colors text-xs font-semibold uppercase tracking-widest">
                See Full Journal <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>expand_more</span>
              </button>
            </div>
          </div>
        </section>

        {/* ── ONBOARDING / CONNECT ── */}
        <section className="py-28 px-6 md:px-16" style={{ background: "#0a0a0a" }}>
          <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-4">[ Onboarding ]</p>
              <h2 className="text-3xl md:text-5xl font-bold leading-tight mb-12">Connect &amp;<br />Analyze</h2>
              <div className="space-y-10 relative">
                <div className="absolute left-[11px] top-8 bottom-0 w-px bg-white/8" />
                {[
                  { n: "01", title: "Sync MT5", desc: "Securely connect your MetaTrader account via our high-speed bridge.", dim: false },
                  { n: "02", title: "Auto-Import", desc: "Your trade history and active positions sync in real-time.", dim: true },
                  { n: "03", title: "Improve Edge", desc: "Review behavioral insights and optimize your strategy.", dim: true },
                ].map(({ n, title, desc, dim }) => (
                  <div key={n} className="flex gap-6">
                    <div className={`text-base font-bold shrink-0 ${dim ? "text-on-surface-variant opacity-30" : "text-on-surface-variant"}`}>{n}</div>
                    <div>
                      <h4 className={`text-base font-semibold mb-1 uppercase tracking-wide ${dim ? "text-on-surface-variant opacity-40" : "text-white"}`}>{title}</h4>
                      <p className={`text-sm leading-relaxed ${dim ? "text-on-surface-variant opacity-30" : "text-on-surface-variant"}`}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* MT5 Bridge card */}
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl opacity-30"
                style={{ background: "radial-gradient(circle, rgba(0,51,173,0.4) 0%, transparent 70%)", filter: "blur(40px)" }} />
              <div className="relative rounded-2xl border border-white/10 p-8"
                style={{ background: "rgba(20,20,28,0.85)", backdropFilter: "blur(20px)" }}>
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">terminal</span>
                    <span className="font-semibold">MT5 Bridge</span>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">more_horiz</span>
                </div>
                <div className="space-y-4 mb-6">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/8">
                    <p className="text-xs text-on-surface-variant mb-1">Status</p>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Active</span>
                      <span className="text-xs bg-white/8 text-green-400 px-3 py-1 rounded-lg font-medium">Connected</span>
                    </div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/8">
                    <p className="text-xs text-on-surface-variant mb-1">Last Sync</p>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">2m ago</span>
                      <span className="text-xs bg-white/8 text-on-surface-variant px-3 py-1 rounded-lg">14 Trades</span>
                    </div>
                  </div>
                </div>
                <button className="w-full bg-primary-container text-white py-4 rounded-xl font-semibold text-sm hover:opacity-90 transition-all shadow-lg">
                  Open Analytics
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── SOCIAL PROOF ── */}
        <section className="py-28 px-6 md:px-16 border-y border-white/5" style={{ background: "#0d0d0d" }}>
          <div className="max-w-[1280px] mx-auto">
            <div className="text-center mb-20">
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-4">[ Proven Edge ]</p>
              <h2 className="text-3xl md:text-5xl font-bold">Revolutionizing Trading<br />Performance</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="rounded-2xl border border-white/10 p-10 relative overflow-hidden"
                style={{ background: "rgba(20,20,28,0.7)", backdropFilter: "blur(12px)" }}>
                <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-primary-container to-transparent" />
                <div className="relative z-10">
                  <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-2">[ Data Analyzed ]</p>
                  <p className="text-5xl font-bold mb-4">10M+</p>
                  <p className="text-on-surface-variant text-sm leading-relaxed">Trades analyzed across global markets to refine behavioral models.</p>
                </div>
              </div>
              <div className="space-y-8">
                <div className="border-b border-white/8 pb-8">
                  <p className="text-on-surface-variant text-xs uppercase tracking-widest mb-2">[ Win Rate Increase ]</p>
                  <p className="text-4xl font-bold text-on-surface-variant">25% Avg.</p>
                </div>
                <div>
                  <p className="text-on-surface-variant text-xs uppercase tracking-widest mb-2">[ Daily Synced Trades ]</p>
                  <p className="text-4xl font-bold text-on-surface-variant">500K+</p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 p-8"
                style={{ background: "rgba(20,20,28,0.7)", backdropFilter: "blur(12px)" }}>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-6">[ User Review ]</p>
                <p className="text-base italic mb-8 leading-relaxed text-on-surface">
                  "The behavioral score changed everything. I realized I was revenge trading every Tuesday. TradinX caught what I couldn't see."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-sm">C</div>
                  <div>
                    <p className="text-sm font-semibold">Courtney Henry</p>
                    <p className="text-xs text-on-surface-variant">Pro Forex Trader</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── PRICING ── */}
        <section className="py-28 px-6 md:px-16" style={{ background: "#0a0a0a" }}>
          <div className="max-w-[1280px] mx-auto">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-4">[ Pricing ]</p>
              <h2 className="text-3xl md:text-5xl font-bold mb-8">Simple Plans for<br />Serious Traders</h2>
              <div className="flex items-center justify-center gap-4 text-sm">
                <span className="text-on-surface-variant">Monthly</span>
                <div className="w-12 h-6 bg-primary-container rounded-full relative cursor-pointer flex items-center px-1">
                  <div className="w-4 h-4 bg-white rounded-full ml-auto shadow" />
                </div>
                <span>Annually <span className="text-primary ml-1 text-xs font-semibold">Save 15%</span></span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {/* Starter */}
              <div className="rounded-2xl border border-white/10 p-10"
                style={{ background: "rgba(20,20,28,0.6)", backdropFilter: "blur(12px)" }}>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest flex items-center gap-2 mb-6">
                  <span className="w-2 h-2 rounded-full bg-white/20 shrink-0" /> Starter
                </p>
                <div className="mb-8">
                  <p className="text-4xl font-bold mb-1">Free <span className="text-sm text-on-surface-variant font-normal">/ month</span></p>
                  <p className="text-on-surface-variant text-sm">Essential journaling for developing traders.</p>
                </div>
                <ul className="space-y-3 mb-10">
                  {["1 MT5 Account Slot", "Basic Performance Stats", "Manual Trade Tagging"].map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm">
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: "18px" }}>check</span> {f}
                    </li>
                  ))}
                  <li className="flex items-center gap-3 text-sm opacity-30">
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>block</span> Behavioral Analytics AI
                  </li>
                </ul>
                <Link href="/signup"
                  className="flex items-center justify-between w-full px-6 py-4 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5 transition-all">
                  Get Started <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>chevron_right</span>
                </Link>
              </div>
              {/* Pro */}
              <div className="relative rounded-2xl border border-primary/40 p-10"
                style={{ background: "rgba(0,51,173,0.08)", backdropFilter: "blur(12px)" }}>
                <div className="absolute -top-3.5 right-8 bg-primary-container text-white text-xs font-semibold px-4 py-1 rounded-full">
                  Most Popular
                </div>
                <p className="text-xs text-primary uppercase tracking-widest flex items-center gap-2 mb-6">
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" /> Pro Trader
                </p>
                <div className="mb-8">
                  <p className="text-4xl font-bold mb-1">$19 <span className="text-sm text-on-surface-variant font-normal">/ month</span></p>
                  <p className="text-on-surface-variant text-sm">Advanced edge discovery for pros.</p>
                </div>
                <ul className="space-y-3 mb-10">
                  {["Unlimited Account Slots", "Advanced Behavioral AI", "Candle-by-Candle Replay", "Emotional Trigger Tracking"].map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm">
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: "18px" }}>check</span> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/signup"
                  className="flex items-center justify-between w-full px-6 py-4 rounded-xl bg-primary-container text-white text-sm font-semibold hover:opacity-90 transition-all shadow-xl shadow-primary/20">
                  Upgrade Now <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>chevron_right</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="py-28 px-6 md:px-16" style={{ background: "#0d0d0d" }}>
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-4">[ FAQ ]</p>
              <h2 className="text-3xl md:text-5xl font-bold">Frequently Asked Questions</h2>
            </div>
            <div className="space-y-0 divide-y divide-white/8">
              {[
                { q: "How secure is the MT5 connection?", open: false },
                { q: "What is the behavioral score?", open: true, a: "The Behavioral Score is a proprietary metric that measures your discipline based on your stated trading plan. It identifies deviations, revenge trading, and FOMO entries to give you a quantitative look at your mental state." },
                { q: "Can I export my journal data?", open: false },
                { q: "Does TradinX support MT4 too?", open: false },
              ].map(({ q, open, a }) => (
                <div key={q} className="py-5">
                  <button className={`w-full flex justify-between items-center text-left text-sm font-semibold uppercase tracking-wide ${open ? "text-primary" : "text-white hover:text-primary transition-colors"}`}>
                    {q}
                    <span className="material-symbols-outlined shrink-0 ml-4 text-on-surface-variant">{open ? "expand_less" : "expand_more"}</span>
                  </button>
                  {open && a && <p className="mt-4 text-on-surface-variant text-sm leading-relaxed">{a}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="py-40 px-6 text-center" style={{ background: "#0a0a0a" }}>
          <h2 className="font-black uppercase leading-none mb-8 select-none"
            style={{ fontSize: "clamp(4rem,14vw,10rem)", opacity: 0.06, position: "absolute", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", pointerEvents: "none" }}>
            Journal Starts
          </h2>
          <div className="relative z-10 max-w-xl mx-auto">
            <h2 className="text-5xl md:text-7xl font-black uppercase leading-none mb-10">Journal<br />Starts</h2>
            <p className="text-on-surface-variant mb-10 leading-relaxed">
              Join thousands of traders mastering their psychology and building their future with TradinX.
            </p>
            <Link href="/signup"
              className="inline-flex items-center px-12 py-5 bg-primary-container text-white rounded-xl font-semibold text-base hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-primary/30">
              Start Journaling
            </Link>
          </div>
        </section>

      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/5 py-20 px-6 md:px-16" style={{ background: "#080808" }}>
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
          <div className="space-y-8">
            <div>
              <span className="text-xl font-bold block mb-3">TradinX</span>
              <h3 className="text-2xl md:text-3xl font-bold leading-tight max-w-xs">Master Your Mind.<br />Rule the Market.</h3>
            </div>
            <div className="flex gap-4">
              {["public", "terminal", "alternate_email"].map(icon => (
                <a key={icon} href="#"
                  className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all text-on-surface-variant">
                  <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>{icon}</span>
                </a>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-4">Platform</p>
              <ul className="space-y-2">
                {["Journal", "Pricing", "Psychology AI", "Support"].map(l => (
                  <li key={l}><a href="#" className="text-sm text-on-surface-variant hover:text-white transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-4">Resources</p>
              <ul className="space-y-2">
                {["Help Center", "Privacy Policy", "Terms of Service", "Media Kit"].map(l => (
                  <li key={l}><a href="#" className="text-sm text-on-surface-variant hover:text-white transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="max-w-[1280px] mx-auto pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-on-surface-variant">© 2024 TradinX Journaling Protocol. Precision in the void.</p>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2 text-xs text-on-surface-variant hover:text-white transition-colors">
            Back to Top <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>arrow_upward</span>
          </button>
        </div>
      </footer>

    </div>
  );
}
