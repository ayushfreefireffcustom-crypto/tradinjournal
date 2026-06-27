"use client";
import Link from "next/link";
import Image from "next/image";

export default function Page() {
  return (
    <>

{/*  TopNavBar  */}
<nav className="fixed top-0 w-full z-50 bg-surface/70 backdrop-blur-xl border-b border-white/5 h-20">
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 flex justify-between items-center h-full"><div className="grid grid-cols-3 items-center h-full w-full">
<div className="flex items-center">
<span className="font-display-xl text-headline-md font-bold tracking-tighter text-on-surface">TradinX</span>
</div>
<div className="flex justify-center gap-8 items-center">
<a className="font-body-md text-body-md nav-link-active" href="#">Home</a>
<a className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors" href="#">Features</a>
<a className="font-body-md text-body-md text-on-surface-variant hover:text-on-surface transition-colors" href="#">Pricing</a>
</div>
<div className="flex items-center justify-end gap-4">
<button className="font-label-md text-label-md text-on-surface px-6 py-2 hover:bg-white/5 transition-all duration-300">Sign In</button>
<button className="bg-primary-container text-white font-label-md text-label-md px-6 py-2 rounded-lg hover:scale-105 active:scale-95 transition-all">Get Started</button>
</div>
</div></div>
</nav>
<main className="pt-20">
{/*  Hero Section  */}
<section className="relative min-h-screen flex flex-col items-center justify-center pt-24 pb-32 px-6 md:px-16 overflow-hidden">
<div className="atmospheric-glow -top-48 -left-48"></div>
<div className="atmospheric-glow top-1/2 -right-48"></div>
<div className="z-10 text-center max-w-4xl mb-16">
<div className="inline-flex items-center gap-2 px-4 py-1 rounded-full border border-white/10 bg-white/5 mb-8">
<span className="text-primary font-label-sm text-label-sm">Psychology First</span>
<span className="text-on-surface-variant font-label-sm text-label-sm">Identify Your Emotional Trading Triggers →</span>
</div>
<h1 className="font-display-xl text-headline-lg-mobile md:text-display-xl mb-6 leading-tight">
                    Master Your <span className="text-primary">Trading Psychology</span> with TradinX
</h1>
<p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto mb-10">
                    Gain deep behavioral insights and eliminate revenge trading with automated MT5 journaling and advanced analytics designed for professional traders.
                </p>
<div className="flex flex-col md:flex-row gap-4 justify-center">
<button className="bg-primary-container text-white px-10 py-4 rounded-xl font-headline-md text-headline-md flex items-center justify-center gap-2 group transition-all hover:shadow-[0_0_40px_rgba(0,51,173,0.3)]">
                        Get Started
                        <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
</button>
<button className="border border-outline-variant px-10 py-4 rounded-xl font-headline-md text-headline-md hover:bg-white/5 transition-all">
                        View Demo
                    </button>
</div>
</div>
{/*  Journal Dashboard Preview  */}
<div className="relative w-full max-w-6xl z-10 animate-fade-in-up">
<div className="glass-card rounded-2xl overflow-hidden shadow-2xl p-6 md:p-8 flex flex-col md:flex-row gap-8 transition-all duration-1000 opacity-100 translate-y-0">
<div className="flex-grow">
<div className="flex justify-between items-end mb-8">
<div>
<h3 className="font-headline-md text-headline-md mb-1">XAUUSD <span className="text-on-surface-variant font-body-md text-body-md">/ Gold Long</span></h3>
<p className="text-primary font-display-xl text-headline-md">Win Rate: 68% <span className="text-green-400 text-label-md">+4.2% Profit Factor</span></p>
</div>
<div className="text-right">
<span className="font-label-sm text-label-sm text-on-surface-variant block">Behavioral Score: 94/100</span>
</div>
</div>
<div className="h-64 relative bg-surface-container-low rounded-xl p-4 overflow-hidden">
{/*  Chart Placeholder (Candlesticks)  */}
<div className="absolute inset-0 flex items-end justify-around px-8 pb-12 opacity-50">
<div className="w-2 bg-red-400 h-32 rounded-t"></div>
<div className="w-2 bg-green-400 h-40 rounded-t"></div>
<div className="w-2 bg-green-400 h-48 rounded-t"></div>
<div className="w-2 bg-red-400 h-24 rounded-t"></div>
<div className="w-2 bg-green-400 h-56 rounded-t"></div>
<div className="w-2 bg-green-400 h-60 rounded-t"></div>
</div>
<div className="absolute bottom-4 left-4 right-4 flex justify-between font-label-sm text-label-sm text-on-surface-variant">
<span className="">Mon</span><span className="">Tue</span><span className="">Wed</span><span className="">Thu</span><span className="">Fri</span>
</div>
</div>
</div>
<div className="w-full md:w-80 glass-card bg-surface-container-high/40 rounded-xl p-6 border-none transition-all duration-1000 opacity-100 translate-y-0">
<div className="flex gap-4 mb-6 border-b border-white/10 pb-4">
<button className="text-primary border-b-2 border-primary pb-1 font-label-md text-label-md">Journal</button>
<button className="text-on-surface-variant font-label-md text-label-md">Replay</button>
<button className="text-on-surface-variant font-label-md text-label-md">Notes</button>
</div>
<div className="space-y-4">
<div className="p-4 bg-surface-container rounded-lg border border-white/5">
<label className="block font-label-sm text-label-sm text-on-surface-variant mb-2">Trade Sentiment</label>
<div className="flex justify-between items-center">
<span className="text-headline-md font-display-xl">Confident</span>
<div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded">
<span className="material-symbols-outlined text-sm text-primary">psychology</span>
<span className="font-label-md text-label-md">High R:R</span>
</div>
</div>
</div>
<div className="flex justify-center -my-2 relative z-10">
<div className="bg-primary-container p-2 rounded-full border-4 border-[#0e0e0e]">
<span className="material-symbols-outlined text-on-primary">sync_alt</span>
</div>
</div>
<div className="p-4 bg-surface-container rounded-lg border border-white/5">
<label className="block font-label-sm text-label-sm text-on-surface-variant mb-2">MT5 Account</label>
<div className="flex justify-between items-center">
<span className="text-headline-md font-display-xl">Live-01</span>
<div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded">
<span className="material-symbols-outlined text-sm">terminal</span>
<span className="font-label-md text-label-md">Connected</span>
</div>
</div>
</div>
<button className="w-full bg-primary-container py-4 rounded-xl font-headline-md text-headline-md mt-4 transition-transform active:scale-95">Analyze Session</button>
</div>
</div>
</div>
</div>
</section>
{/*  Brand statement  */}
<section className="py-32 bg-surface-container-lowest border-y border-white/5">
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 text-center">
<p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-4">[ THE MISSION ]</p>
<h2 className="font-display-xl text-headline-lg md:text-headline-lg max-w-4xl mx-auto leading-tight text-on-surface-variant">TRADINX IS THE NEXT-GEN ANALYTICS LAYER FOR MODERN TRADERS. <span className="text-on-surface">IDENTIFY BIASES, REVIEW REPLAYS, AND MASTER THE MARKET.</span></h2>
</div>
</section>
{/*  Core Strengths  */}
<section className="py-40 relative">
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
<div className="relative group">
<div className="absolute -inset-4 bg-primary/10 rounded-3xl blur-2xl group-hover:bg-primary/20 transition-all"></div>
<div className="glass-card rounded-2xl p-8 relative overflow-hidden transition-all duration-1000 opacity-100 translate-y-0">
<div className="flex justify-between items-start mb-12">
<div>
<p className="text-on-surface-variant text-label-md">SESSION PSYCHOLOGY</p>
<p className="text-headline-md">Optimal Discipline</p>
</div>
<div className="bg-primary/20 p-4 rounded-full">
<span className="material-symbols-outlined text-primary">brain</span>
</div>
</div>
<div className="space-y-4 mb-8">
<div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
<div className="h-full bg-primary w-4/5"></div>
</div>
<div className="flex justify-between text-label-sm text-on-surface-variant">
<span className="">Discipline Score</span>
<span className="">80/100</span>
</div>
</div>
<div className="flex items-center gap-3 text-green-400 font-label-md">
<span className="material-symbols-outlined text-sm">verified_user</span>
                            AUTOMATED MT5 LOGGING
                        </div>
</div>
</div>
<div>
<p className="font-label-md text-label-md text-primary mb-4 uppercase">[ FEATURE ]</p>
<h2 className="font-display-xl text-headline-lg mb-8">SEAMLESS MT5 <br/> INTEGRATION</h2>
<div className="space-y-8">
<div className="flex gap-6 items-start">
<div className="text-primary pt-1">
<span className="material-symbols-outlined text-3xl">bolt</span>
</div>
<div>
<h4 className="font-headline-md text-headline-md mb-2">AUTOMATED JOURNALING</h4>
<p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                                    Stop manually entering every trade. TradinX connects directly to MetaTrader 5, importing your entries, exits, and screenshots instantly so you can focus on the "why," not the "what."
                                </p>
</div>
</div>
<button className="bg-surface-container-highest w-full py-4 rounded-xl font-headline-md text-headline-md hover:bg-white/10 transition-colors">SKIP MANUAL WORK</button>
</div>
</div>
</div>
</section>
{/*  Advanced Behavioral Analytics  */}
<section className="py-40 bg-surface-container-lowest">
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 text-center relative">
<div className="absolute inset-0 flex items-center justify-center">
<h3 className="font-display-xl text-[12vw] opacity-5 select-none font-extrabold uppercase">BEHAVIORAL AI</h3>
</div>
<div className="relative z-10">
<p className="font-label-md text-label-md text-primary mb-4 uppercase">[ ANALYSIS ]</p>
<h2 className="font-display-xl text-headline-lg mb-20">IDENTIFY YOUR <br/> EMOTIONAL PATTERNS</h2>
<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
<div className="glass-card p-6 rounded-xl text-left border-primary/20 bg-primary/5 transition-all duration-1000 opacity-100 translate-y-0">
<span className="material-symbols-outlined text-primary mb-4">warning</span>
<h4 className="font-headline-md text-headline-md mb-2">Revenge Trading Detector</h4>
<p className="text-on-surface-variant text-label-sm">Automatically flags clusters of trades following a loss to identify emotional chasing.</p>
</div>
<div className="glass-card p-6 rounded-xl text-left transition-all duration-1000 opacity-100 translate-y-0">
<span className="material-symbols-outlined text-on-surface-variant mb-4">timer</span>
<h4 className="font-headline-md text-headline-md mb-2">FOMO Analytics</h4>
<p className="text-on-surface-variant text-label-sm">Compares entry precision against signal timing to measure patience levels.</p>
</div>
<div className="glass-card p-6 rounded-xl text-left transition-all duration-1000 opacity-100 translate-y-0">
<span className="material-symbols-outlined text-on-surface-variant mb-4">query_stats</span>
<h4 className="font-headline-md text-headline-md mb-2">Profit Taking Habits</h4>
<p className="text-on-surface-variant text-label-sm">Analyzes if you're cutting winners too early or letting losers run based on your plan.</p>
</div>
</div>
</div>
</div>
</section>
{/*  Trade Replay & Analytics  */}
<section className="py-40 relative overflow-hidden">
<div className="atmospheric-glow top-0 right-0"></div>
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
<div className="glass-card p-10 rounded-3xl relative transition-all duration-1000 opacity-100 translate-y-0">
<div className="flex justify-between items-center mb-10">
<div>
<p className="font-label-sm text-label-sm text-on-surface-variant">EDGE DISCOVERY ENGINE</p>
<h4 className="font-headline-md text-headline-md">PERFORMANCE</h4>
</div>
<div className="bg-white/5 px-4 py-1 rounded text-label-sm">ALL TIME</div>
</div>
<div className="flex justify-center mb-10 relative">
<div className="w-64 h-64 rounded-full border-[16px] border-white/5 flex flex-col items-center justify-center relative">
<div className="absolute inset-0 rounded-full border-[16px] border-primary border-t-transparent border-r-transparent -rotate-12"></div>
<p className="text-on-surface-variant text-label-sm">WIN RATE</p>
<p className="text-display-xl text-headline-lg">62.5%</p>
</div>
</div>
<div className="grid grid-cols-2 gap-4">
<div className="bg-surface-container p-4 rounded-xl">
<div className="flex items-center gap-2 mb-1">
<div className="w-2 h-2 rounded-full bg-primary"></div>
<span className="text-label-sm text-on-surface-variant">AVG R:R</span>
</div>
<p className="font-headline-md text-headline-md">1:2.4</p>
<span className="text-green-400 text-label-sm">+ 12% EFFICIENCY</span>
</div>
<div className="bg-surface-container p-4 rounded-xl">
<div className="flex items-center gap-2 mb-1">
<div className="w-2 h-2 rounded-full bg-tertiary"></div>
<span className="text-label-sm text-on-surface-variant">PROFIT FACTOR</span>
</div>
<p className="font-headline-md text-headline-md">2.82</p>
<span className="text-on-surface-variant text-label-sm">SYSTEM STABILITY</span>
</div>
</div>
</div>
<div>
<p className="font-label-md text-label-md text-primary mb-4 uppercase">[ CAPABILITIES ]</p>
<h2 className="font-display-xl text-headline-lg mb-8">TRADE REPLAY <br/> &amp; REVIEW</h2>
<div className="space-y-4">
<div className="glass-card p-6 rounded-xl border-primary/30 transition-all duration-1000 opacity-100 translate-y-0">
<div className="flex justify-between items-center mb-4">
<div className="flex gap-4 items-center">
<span className="material-symbols-outlined text-primary">play_circle</span>
<h5 className="font-headline-md text-headline-md">CANDLE-BY-CANDLE REVIEW</h5>
</div>
<span className="material-symbols-outlined">expand_less</span>
</div>
<p className="font-body-md text-body-md text-on-surface-variant">Relive your trades candle-by-candle to see exactly what you were thinking and how the market reacted in real-time.</p>
</div>
<div className="p-6 border border-white/5 rounded-xl flex justify-between items-center group hover:bg-white/5 transition-all">
<div className="flex gap-4 items-center">
<span className="material-symbols-outlined text-on-surface-variant">camera_alt</span>
<h5 className="font-headline-md text-headline-md text-on-surface-variant group-hover:text-on-surface transition-colors">AUTO-CHART CAPTURE</h5>
</div>
<span className="material-symbols-outlined">expand_more</span>
</div>
<div className="p-6 border border-white/5 rounded-xl flex justify-between items-center group hover:bg-white/5 transition-all">
<div className="flex gap-4 items-center">
<span className="material-symbols-outlined text-on-surface-variant">history_edu</span>
<h5 className="font-headline-md text-headline-md text-on-surface-variant group-hover:text-on-surface transition-colors">PRE &amp; POST-TRADE NOTES</h5>
</div>
<span className="material-symbols-outlined">expand_more</span>
</div>
<div className="p-6 border border-white/5 rounded-xl flex justify-between items-center group hover:bg-white/5 transition-all">
<div className="flex gap-4 items-center">
<span className="material-symbols-outlined text-on-surface-variant">psychology_alt</span>
<h5 className="font-headline-md text-headline-md text-on-surface-variant group-hover:text-on-surface transition-colors">EMOTIONAL TAGGING</h5>
</div>
<span className="material-symbols-outlined">expand_more</span>
</div>
</div>
</div>
</div>
</section>
{/*  Performance Tracker  */}
<section className="py-40 bg-surface-container-lowest relative overflow-hidden">
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 text-center relative z-10">
<h2 className="font-display-xl text-[10vw] font-black opacity-10 absolute -top-12 left-1/2 -translate-x-1/2 w-full">PERFORMANCE</h2>
<div className="pt-20">
<div className="flex justify-between items-end mb-12 border-b border-white/10 pb-6">
<h3 className="font-headline-md text-headline-md">RECENT TRADES <span className="text-on-surface-variant font-label-md text-label-md ml-4">MT5 SYNCED</span></h3>
<div className="bg-white/5 p-1 rounded-lg flex">
<button className="px-4 py-1 rounded bg-white/10 text-label-sm">WEEK</button>
<button className="px-4 py-1 text-label-sm text-on-surface-variant">MONTH</button>
</div>
</div>
<div className="space-y-2">
{/*  Trade Row 1  */}
<div className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-white/5 transition-colors group cursor-pointer border-b border-white/5">
<div className="col-span-1 text-left"><span className="material-symbols-outlined text-on-surface-variant">bookmark</span></div>
<div className="col-span-4 flex gap-4 items-center text-left">
<div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center font-bold">X</div>
<div>
<p className="font-headline-md text-headline-md">XAUUSD <span className="text-on-surface-variant text-label-sm">Buy</span></p>
<p className="text-on-surface-variant text-label-sm">Gold / US Dollar</p>
</div>
</div>
<div className="col-span-4 text-center">
<div className="flex items-center justify-center gap-2">
<span className="px-2 py-1 bg-green-500/10 text-green-400 text-label-sm rounded">High Quality</span>
<span className="px-2 py-1 bg-white/5 text-on-surface-variant text-label-sm rounded">Trend Follow</span>
</div>
</div>
<div className="col-span-3 text-right">
<p className="font-headline-md text-headline-md">$ +1,240.00</p>
<p className="text-green-400 text-label-sm">R:R 1:3.2</p>
</div>
</div>
{/*  Trade Row 2  */}
<div className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-white/5 transition-colors group cursor-pointer border-b border-white/5">
<div className="col-span-1 text-left"><span className="material-symbols-outlined text-primary">star</span></div>
<div className="col-span-4 flex gap-4 items-center text-left">
<div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center font-bold text-orange-500">N</div>
<div>
<p className="font-headline-md text-headline-md">NAS100 <span className="text-on-surface-variant text-label-sm">Sell</span></p>
<p className="text-on-surface-variant text-label-sm">Nasdaq 100</p>
</div>
</div>
<div className="col-span-4 text-center">
<div className="flex items-center justify-center gap-2">
<span className="px-2 py-1 bg-red-500/10 text-red-400 text-label-sm rounded">Impatience</span>
<span className="px-2 py-1 bg-white/5 text-on-surface-variant text-label-sm rounded">News Fade</span>
</div>
</div>
<div className="col-span-3 text-right">
<p className="font-headline-md text-headline-md">$ -450.00</p>
<p className="text-red-400 text-label-sm">R:R 1:1.5</p>
</div>
</div>
{/*  Trade Row 3  */}
<div className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-white/5 transition-colors group cursor-pointer border-b border-white/5">
<div className="col-span-1 text-left"><span className="material-symbols-outlined text-on-surface-variant">bookmark</span></div>
<div className="col-span-4 flex gap-4 items-center text-left">
<div className="w-10 h-10 bg-blue-400/20 rounded-full flex items-center justify-center font-bold text-blue-400">E</div>
<div>
<p className="font-headline-md text-headline-md">EURUSD <span className="text-on-surface-variant text-label-sm">Buy</span></p>
<p className="text-on-surface-variant text-label-sm">Euro / US Dollar</p>
</div>
</div>
<div className="col-span-4 text-center">
<div className="flex items-center justify-center gap-2">
<span className="px-2 py-1 bg-green-500/10 text-green-400 text-label-sm rounded">Disciplined</span>
<span className="px-2 py-1 bg-white/5 text-on-surface-variant text-label-sm rounded">Breakout</span>
</div>
</div>
<div className="col-span-3 text-right">
<p className="font-headline-md text-headline-md">$ +680.00</p>
<p className="text-green-400 text-label-sm">R:R 1:2.1</p>
</div>
</div>
</div>
<button className="mt-12 text-on-surface-variant hover:text-on-surface flex items-center gap-2 mx-auto font-label-md text-label-md uppercase tracking-widest">SEE FULL JOURNAL <span className="material-symbols-outlined">expand_more</span></button>
</div>
</div>
</section>
{/*  Getting Started  */}
<section className="py-40 bg-background relative">
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 flex flex-col md:flex-row gap-6">
<div className="md:w-1/2">
<p className="font-label-md text-label-md text-primary mb-4 uppercase tracking-widest">[ ONBOARDING ]</p>
<h2 className="font-display-xl text-headline-lg mb-12">CONNECT &amp; <br/> ANALYZE</h2>
<div className="space-y-12">
<div className="relative pl-16">
<div className="absolute left-0 top-0 text-headline-md text-on-surface-variant font-bold">01</div>
<h4 className="font-headline-md text-headline-md mb-2">SYNC MT5</h4>
<p className="text-on-surface-variant font-body-md text-body-md">Securely connect your MetaTrader account via our high-speed bridge.</p>
<div className="absolute left-3 top-8 bottom-[-48px] w-px bg-white/10"></div>
</div>
<div className="relative pl-16">
<div className="absolute left-0 top-0 text-headline-md text-on-surface-variant font-bold opacity-30">02</div>
<h4 className="font-headline-md text-headline-md mb-2 text-on-surface-variant">AUTO-IMPORT</h4>
<p className="text-on-surface-variant font-body-md text-body-md opacity-30">Your trade history and active positions sync in real-time.</p>
</div>
<div className="relative pl-16">
<div className="absolute left-0 top-0 text-headline-md text-on-surface-variant font-bold opacity-30">03</div>
<h4 className="font-headline-md text-headline-md mb-2 text-on-surface-variant">IMPROVE EDGE</h4>
<p className="text-on-surface-variant font-body-md text-body-md opacity-30">Review behavioral insights and optimize your strategy.</p>
</div>
</div>
</div>
<div className="md:w-1/2 relative">
<div className="glass-card p-8 rounded-2xl border-white/10 relative z-10 scale-90 translate-y-12 shadow-[0_50px_100px_rgba(0,0,0,0.5)] transition-all duration-1000 opacity-100 translate-y-0">
<div className="flex justify-between items-center mb-8">
<div className="flex items-center gap-2">
<span className="material-symbols-outlined text-primary">terminal</span>
<span className="font-headline-md text-headline-md">MT5 Bridge</span>
</div>
<span className="material-symbols-outlined">more_horiz</span>
</div>
<div className="space-y-6">
<div className="p-4 bg-white/5 rounded-lg border border-white/10">
<p className="text-label-sm text-on-surface-variant mb-1">Status</p>
<div className="flex justify-between items-center">
<span className="text-display-xl text-headline-md">Active</span>
<span className="text-label-md bg-white/10 px-3 py-1 rounded text-green-400">Connected</span>
</div>
</div>
<div className="p-4 bg-white/5 rounded-lg border border-white/10">
<p className="text-label-sm text-on-surface-variant mb-1">Last Sync</p>
<div className="flex justify-between items-center">
<span className="text-display-xl text-headline-md">2m ago</span>
<span className="text-label-md bg-white/10 px-3 py-1 rounded">14 Trades</span>
</div>
</div>
<button className="w-full bg-primary-container py-4 rounded-xl font-headline-md text-headline-md shadow-lg shadow-primary/20">Open Analytics</button>
</div>
</div>
<div className="absolute inset-0 bg-primary/20 blur-[120px] -z-10"></div>
</div>
</div>
</section>
{/*  Trust & Scale  */}
<section className="py-40 bg-surface-container-low border-y border-white/5">
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16">
<div className="text-center mb-24">
<p className="font-label-md text-label-md text-primary mb-4 uppercase tracking-widest">[ PROVEN EDGE ]</p>
<h2 className="font-display-xl text-headline-lg">REVOLUTIONIZING TRADING <br/> PERFORMANCE</h2>
</div>
<div className="grid grid-cols-1 md:grid-cols-3 gap-12 items-start">
<div className="glass-card p-12 rounded-3xl relative h-full flex flex-col justify-center transition-all duration-1000 opacity-100 translate-y-0">
<img className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none" data-alt="A stylized glowing digital map of the world visualized with connecting data lines and points of light against a deep navy blue background. The mood is professional, high-tech, and globally expansive, perfectly fitting a modern fintech aesthetic. Minimalist and sleek with semi-transparent overlays." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDBDx4sJ5iMLrFxd7X_BlOXn1htMrI3gF8VoNbwVOu3A8iqUWnL3uIuEAfGBd3y9mogc9uRz-6pMKcGJh9VL61LUODFgcCKm5IOgo7TPe2kw_buAnbF5L_S_-mffoWWvLqrJGjVNOY_kzBo1Mf1gGPe3TYqnQm-mwYhCxj3bKSmgOgU-wK_aaxPUOsnquNcs4b4Pp7egCu_I6q82Qb36s3RF1hzRjJkDlYTTdOOtYCkIJdEJQOE3xz_Scp6n9X_sS7dAjs3-EJBd0E"/>
<div className="relative z-10">
<p className="text-primary font-label-md text-label-md mb-2">[ DATA ANALYZED ]</p>
<h3 className="font-display-xl text-headline-lg mb-4">10M+</h3>
<p className="text-on-surface-variant font-body-md text-body-md">Trades analyzed across global markets to refine behavioral models.</p>
</div>
</div>
<div className="space-y-12">
<div className="border-b border-white/10 pb-8">
<p className="text-on-surface-variant font-label-md text-label-md mb-2 uppercase">[ WIN RATE INCREASE ]</p>
<h3 className="font-display-xl text-headline-lg text-on-surface-variant">25% Avg.</h3>
</div>
<div className="border-b border-white/10 pb-8">
<p className="text-on-surface-variant font-label-md text-label-md mb-2 uppercase">[ DAILY SYNCED TRADES ]</p>
<h3 className="font-display-xl text-headline-lg text-on-surface-variant">500K+</h3>
</div>
</div>
<div className="glass-card p-8 rounded-2xl relative transition-all duration-1000 opacity-100 translate-y-0">
<p className="font-label-md text-label-md text-on-surface-variant uppercase mb-8 tracking-widest">[ USER REVIEW ]</p>
<p className="font-headline-md text-headline-md italic mb-8 leading-relaxed">"The behavioral score changed everything. I realized I was revenge trading every Tuesday after London session. TradinX caught what I couldn't see."</p>
<div className="flex items-center gap-4">
<div className="w-12 h-12 rounded-full overflow-hidden bg-primary/20">
<img className="w-full h-full object-cover" data-alt="Close-up professional studio portrait of a confident technology executive. Soft, cinematic lighting highlights their determined expression against a deep monochromatic background. The aesthetic is clean, sophisticated, and matches a high-end corporate fintech branding." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBGJZXhA1CW9blEBWfHUh8FxgLMZA-De_L80kU2h2RnHREQPZW1P13jValIxAFJzNM9OK5gr4bfm3HujzCrHLgzrHIe6XzSzFmWiQn3Df00gab89S34KWMaT2mrQ2jVCbLmARmfwiseT0ZTuwwBPoPJqQpo5mrP3roAezaiOQ_1OmxriAxL4kGM9u9N2pCxFc1J17QUltS3hEiMX-57oE42bxJabcDQFMOXLFrmgAtq-SnNhSUszxXknR8cTia7qdSj_IWTEqJOiaQ"/>
</div>
<div>
<p className="font-label-md text-label-md">COURTNEY HENRY</p>
<p className="text-label-sm text-on-surface-variant">PRO FOREX TRADER</p>
</div>
</div>
</div>
</div>
</div>
</section>
{/*  Pricing/Fees  */}
<section className="py-40 bg-background relative overflow-hidden">
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 relative z-10">
<div className="text-center mb-24">
<p className="font-label-md text-label-md text-primary mb-4 uppercase tracking-widest">[ PRICING ]</p>
<h2 className="font-display-xl text-headline-lg">SIMPLE PLANS FOR <br/> SERIOUS TRADERS</h2>
<div className="flex items-center justify-center gap-4 mt-8">
<span className="text-label-md">Monthly</span>
<div className="w-14 h-7 bg-primary-container rounded-full relative p-1 cursor-pointer">
<div className="w-5 h-5 bg-white rounded-full ml-auto shadow-md"></div>
</div>
<span className="text-label-md">Annually <span className="text-primary ml-2 text-label-sm">Save 15%</span></span>
</div>
</div>
<div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
{/*  Starter Plan  */}
<div className="glass-card p-10 rounded-3xl border-white/5 relative hover:border-white/20 transition-all duration-1000 opacity-100 translate-y-0">
<p className="font-label-md text-label-md text-on-surface-variant mb-6 flex items-center gap-2">
<span className="w-2 h-2 bg-white/20 rounded-full"></span> STARTER
                        </p>
<div className="mb-10">
<h3 className="font-display-xl text-headline-lg">FREE <span className="text-label-md text-on-surface-variant">PER MONTH</span></h3>
<p className="text-on-surface-variant font-label-md text-label-md">Essential journaling for developing traders.</p>
</div>
<ul className="space-y-4 mb-12">
<li className="flex items-center gap-3 text-label-md">
<span className="material-symbols-outlined text-primary text-xl">check</span> 1 MT5 Account Slot
                            </li>
<li className="flex items-center gap-3 text-label-md">
<span className="material-symbols-outlined text-primary text-xl">check</span> Basic Performance Stats
                            </li>
<li className="flex items-center gap-3 text-label-md">
<span className="material-symbols-outlined text-primary text-xl">check</span> Manual Trade Tagging
                            </li>
<li className="flex items-center gap-3 text-label-md opacity-30">
<span className="material-symbols-outlined text-xl">block</span> Behavioral Analytics AI
                            </li>
</ul>
<button className="w-full py-4 rounded-xl border border-white/10 font-headline-md text-headline-md hover:bg-white/5 transition-all flex justify-between px-6">
                            GET STARTED <span className="material-symbols-outlined">chevron_right</span>
</button>
</div>
{/*  Pro Plan  */}
<div className="glass-card p-10 rounded-3xl border-primary bg-primary/5 relative hover:shadow-[0_0_80px_rgba(0,51,173,0.2)] transition-all duration-1000 opacity-100 translate-y-0">
<div className="absolute -top-4 right-10 bg-primary-container text-white px-4 py-1 rounded-full text-label-sm">MOST POPULAR</div>
<p className="font-label-md text-label-md text-primary mb-6 flex items-center gap-2">
<span className="w-2 h-2 bg-primary rounded-full"></span> PRO TRADER
                        </p>
<div className="mb-10">
<h3 className="font-display-xl text-headline-lg">$19 <span className="text-label-md text-on-surface-variant">PER MONTH</span></h3>
<p className="text-on-surface-variant font-label-md text-label-md">Advanced edge discovery for pros.</p>
</div>
<ul className="space-y-4 mb-12">
<li className="flex items-center gap-3 text-label-md">
<span className="material-symbols-outlined text-primary text-xl">check</span> Unlimited Account Slots
                            </li>
<li className="flex items-center gap-3 text-label-md">
<span className="material-symbols-outlined text-primary text-xl">check</span> Advanced Behavioral AI
                            </li>
<li className="flex items-center gap-3 text-label-md">
<span className="material-symbols-outlined text-primary text-xl">check</span> Candle-by-Candle Replay
                            </li>
<li className="flex items-center gap-3 text-label-md">
<span className="material-symbols-outlined text-primary text-xl">check</span> Emotional Trigger Tracking
                            </li>
</ul>
<button className="w-full py-4 bg-primary-container rounded-xl font-headline-md text-headline-md shadow-xl shadow-primary/20 flex justify-between px-6">
                            UPGRADE NOW <span className="material-symbols-outlined">chevron_right</span>
</button>
</div>
</div>
</div>
</section>
{/*  FAQ  */}
<section className="py-40 bg-surface-container-lowest">
<div className="max-w-3xl mx-auto px-6">
<div className="text-center mb-16">
<p className="font-label-md text-label-md text-primary mb-4 uppercase tracking-widest">[ FAQ ]</p>
<h2 className="font-display-xl text-headline-lg">FREQUENTLY ASKED QUESTIONS</h2>
</div>
<div className="space-y-4">
<div className="border-b border-white/10 pb-6">
<button className="w-full flex justify-between items-center text-left py-4 hover:text-primary transition-colors">
<span className="font-headline-md text-headline-md">HOW SECURE IS THE MT5 CONNECTION?</span>
<span className="material-symbols-outlined">expand_more</span>
</button>
</div>
<div className="border-b border-white/10 pb-6">
<button className="w-full flex justify-between items-center text-left py-4 text-primary">
<span className="font-headline-md text-headline-md">WHAT IS THE BEHAVIORAL SCORE?</span>
<span className="material-symbols-outlined">expand_less</span>
</button>
<div className="pt-4 text-on-surface-variant font-body-md text-body-md leading-relaxed">
                            The Behavioral Score is a proprietary metric that measures your discipline based on your stated trading plan. It identifies deviations, revenge trading, and FOMO entries to give you a quantitative look at your mental state.
                        </div>
</div>
<div className="border-b border-white/10 pb-6">
<button className="w-full flex justify-between items-center text-left py-4 hover:text-primary transition-colors">
<span className="font-headline-md text-headline-md">CAN I EXPORT MY JOURNAL DATA?</span>
<span className="material-symbols-outlined">expand_more</span>
</button>
</div>
<div className="border-b border-white/10 pb-6">
<button className="w-full flex justify-between items-center text-left py-4 hover:text-primary transition-colors">
<span className="font-headline-md text-headline-md">DOES TRADINX SUPPORT MT4 TOO?</span>
<span className="material-symbols-outlined">expand_more</span>
</button>
</div>
</div>
</div>
</section>
{/*  Final CTA  */}
<section className="py-40 relative bg-surface-container-lowest">
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 text-center relative z-10">
<h2 className="font-display-xl text-[12vw] font-black leading-none mb-12 select-none">
                    JOURNAL <br/> STARTS
                </h2>
<p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl mx-auto mb-10">
                    Join thousands of traders mastering their psychology and building their future with TradinX.
                </p>
<button className="bg-primary-container text-white px-12 py-5 rounded-xl font-headline-md text-headline-md shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all">
                    START JOURNALING
                </button>
</div>
</section>
</main>
{/*  Footer  */}
<footer className="bg-surface-container-lowest border-t border-white/5 py-24">
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 grid grid-cols-1 md:grid-cols-2 gap-6">
<div className="space-y-12">
<div className="space-y-4">
<span className="font-display-xl text-headline-md font-bold text-on-surface">TradinX</span>
<h3 className="font-display-xl text-headline-lg max-w-md">MASTER YOUR MIND. <br/> RULE THE MARKET.</h3>
</div>
<div className="flex gap-6">
<a className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all" href="#">
<span className="material-symbols-outlined text-sm">public</span>
</a>
<a className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all" href="#">
<span className="material-symbols-outlined text-sm">terminal</span>
</a>
<a className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/5 transition-all" href="#">
<span className="material-symbols-outlined text-sm">alternate_email</span>
</a>
</div>
</div>
<div className="grid grid-cols-2 gap-6">
<div className="space-y-4">
<p className="font-label-md text-label-md text-on-surface font-bold">PLATFORM</p>
<ul className="space-y-2">
<li className=""><a className="font-label-md text-label-md text-on-tertiary-container hover:text-on-surface transition-colors" href="#">Journal</a></li>
<li className=""><a className="font-label-md text-label-md text-on-tertiary-container hover:text-on-surface transition-colors" href="#">Pricing</a></li>
<li className=""><a className="font-label-md text-label-md text-on-tertiary-container hover:text-on-surface transition-colors" href="#">Psychology AI</a></li>
<li className=""><a className="font-label-md text-label-md text-on-tertiary-container hover:text-on-surface transition-colors" href="#">Support</a></li>
</ul>
</div>
<div className="space-y-4">
<p className="font-label-md text-label-md text-on-surface font-bold">RESOURCES</p>
<ul className="space-y-2">
<li className=""><a className="font-label-md text-label-md text-on-tertiary-container hover:underline" href="#">Help Center</a></li>
<li className=""><a className="font-label-md text-label-md text-on-tertiary-container hover:underline" href="#">Privacy Policy</a></li>
<li className=""><a className="font-label-md text-label-md text-on-tertiary-container hover:underline" href="#">Terms of Service</a></li>
<li className=""><a className="font-label-md text-label-md text-on-tertiary-container hover:underline" href="#">Media Kit</a></li>
</ul>
</div>
</div>
</div>
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 mt-24 pt-12 border-t border-white/5 flex justify-between items-center">
<p className="font-label-md text-label-md text-on-tertiary-container">© 2024 TradinX Journaling Protocol. Precision in the void.</p>
<button className="font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-2" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
                BACK TO TOP <span className="material-symbols-outlined text-sm">arrow_upward</span>
</button>
</div>
</footer>


    </>
  );
}
