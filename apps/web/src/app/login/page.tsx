"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function Page() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      // 🚨 MOCK DEV ENVIRONMENT: Bypassing real backend due to missing shared DB credentials.
      // const res = await authClient.signIn.email({ email, password });
      // if (res?.error) {
      //    throw new Error(res.error.message || res.error.statusText || 'Sign in failed');
      // }

      // Simulate network request
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setGoogleLoading(true);
    setError("");
    try {
      // 🚨 MOCK DEV ENVIRONMENT: Bypassing real backend
      // const res = await authClient.signIn.social({ provider: 'google', callbackURL: '/dashboard' });
      // if (res?.error) throw new Error(res.error.message || 'Google sign-in failed');
      
      await new Promise((resolve) => setTimeout(resolve, 800));
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message ?? "Google sign-in failed");
      setGoogleLoading(false);
    }
  };

  return (
    <>

{/*  Decorative Background  */}
<div className="fixed inset-0 z-[-1]">
<div className="absolute inset-0 grid-pattern"></div>
<div className="absolute inset-0 mesh-gradient"></div>
<div className="absolute top-[-10%] right-[-10%] w-[40rem] h-[40rem] bg-primary/10 blur-[120px] rounded-full"></div>
<div className="absolute bottom-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-primary/5 blur-[120px] rounded-full"></div>
</div>
{/*  Header Navigation (Simplified for Auth)  */}
<header className="fixed top-0 w-full z-50">
<div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 h-20 flex items-center">
<div className="font-headline-md text-headline-md font-bold tracking-tighter text-white">
                TradinX
            </div>
</div>
</header>
{/*  Main Content: Centered Auth Card  */}
<main className="flex-grow flex items-center justify-center pt-24 pb-12 px-6 md:px-0">
<div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
<div className="glass-card rounded-xl p-6 md:p-8 shadow-2xl relative overflow-hidden">{/*  Inner Decorative Glow  */}
<div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 blur-[60px] rounded-full pointer-events-none"></div>
<div className="relative z-10">
{/*  Brand Identity  */}
<div className="text-center mb-6">
<h1 className="font-headline-md text-on-surface mb-1 text-headline-md">Welcome Back</h1>
<p className="font-label-sm text-label-sm text-on-surface-variant">Precision insights for your next trade.</p>
</div>
{/*  Sign In Form  */}
<form onSubmit={handleSubmit} className="space-y-4">
<div>
<label className="block font-label-sm text-label-sm text-on-surface-variant mb-1 ml-1" htmlFor="email">Email Address</label>
<div className="relative">
<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">mail</span>
<input className="neo-input w-full pl-10 pr-4 py-2.5 rounded-lg font-body-md text-body-md text-on-surface placeholder:text-outline/50 bg-surface-container-low" id="email" name="email" placeholder="name@company.com" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
</div>
</div>
<div>
<div className="flex justify-between items-center mb-1 ml-1">
<label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="password">Password</label>
<a className="font-label-sm text-label-sm text-primary hover:underline transition-all" href="#">Forgot Password?</a>
</div>
<div className="relative">
<span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">lock</span>
<input className="neo-input w-full pl-10 pr-4 py-2.5 rounded-lg font-body-md text-body-md text-on-surface placeholder:text-outline/50 bg-surface-container-low" id="password" name="password" placeholder="••••••••" required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
</div>
</div>
<div className="flex items-center gap-3 py-1">
<input className="w-4 h-4 rounded border-outline-variant bg-surface-container text-primary focus:ring-primary/20" id="remember" type="checkbox" />
<label className="font-label-md text-label-md text-on-surface-variant cursor-pointer" htmlFor="remember">Stay signed in</label>
</div>
{error && <div className="text-red-500 font-label-sm text-sm">{error}</div>}
<button disabled={loading || googleLoading} className="w-full py-3 bg-primary-container font-label-md text-label-md rounded-lg primary-btn-glow transition-all duration-300 flex justify-center items-center gap-2 text-white" type="submit">{loading ? "Signing In..." : "Sign In"} <span className="material-symbols-outlined text-md">arrow_forward</span></button>
</form>
{/*  Divider  */}
<div className="relative my-6">
<div className="absolute inset-0 flex items-center">
<div className="w-full border-t border-outline-variant/10"></div>
</div>
<div className="relative flex justify-center text-label-sm text-label-sm">
<span className="px-4 bg-[#111827] text-on-surface-variant uppercase tracking-widest">Or continue with</span>
</div>
</div>
{/*  Social Logins  */}
<div className="grid gap-4">
<button type="button" onClick={handleGoogle} disabled={loading || googleLoading} className="w-full py-3 glass-card rounded-lg flex justify-center items-center gap-3 hover:bg-white/5 duration-300 border border-outline-variant/20">
<svg className="w-5 h-5" viewBox="0 0 24 24">
<path d="M12 5.04c1.64 0 3.12.56 4.28 1.67l3.22-3.22C17.52 1.64 14.95 1 12 1 7.37 1 3.38 3.69 1.48 7.63l3.85 2.99C6.24 7.65 8.89 5.04 12 5.04z" fill="#EA4335"></path>
<path d="M23.49 12.27c0-.8-.07-1.57-.2-2.31H12v4.38h6.45c-.28 1.48-1.12 2.74-2.38 3.58l3.71 2.87c2.17-2 3.71-4.94 3.71-8.52z" fill="#4285F4"></path>
<path d="M5.33 14.62C5.08 13.88 4.95 13.1 4.95 12.3s.13-1.58.38-2.32L1.48 6.99c-.8 1.66-1.25 3.53-1.25 5.51s.45 3.85 1.25 5.51l3.85-3z" fill="#FBBC05"></path>
<path d="M12 23c3.12 0 5.73-1.02 7.65-2.77l-3.71-2.87c-1.08.73-2.47 1.16-3.94 1.16-3.11 0-5.76-2.61-6.67-5.59l-3.85 3C3.38 20.31 7.37 23 12 23z" fill="#34A853"></path>
</svg>
<span className="font-label-md text-label-md text-on-surface">Continue with Google</span>
</button>
</div>
{/*  Footer Link  */}
<div className="mt-8 text-center">
<p className="font-body-md text-on-surface-variant text-label-sm">
                            Don't have an account? 
                            <Link className="text-primary font-bold hover:text-primary-fixed transition-colors" href="/signup">Sign Up</Link>
</p>
</div>
</div></div>
{/*  Trust Badge  */}
<div className="mt-8 text-center">
<p className="font-label-sm text-label-sm text-on-surface-variant">
    By signing in, you agree to our 
    <a className="text-primary hover:underline transition-all" href="#">Terms</a> 
    and 
    <a className="text-primary hover:underline transition-all" href="#">Privacy Policy</a>
</p>
</div>
</div>
</main>
{/*  Global Footer Component  */}
{/*  Micro-interaction Scripts  */}




    </>
  );
}
