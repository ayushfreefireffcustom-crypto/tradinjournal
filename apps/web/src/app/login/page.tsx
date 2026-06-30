"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const { signIn } = authClient;

export default function LoginPage() {
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
      const res = await signIn.email({ email, password, callbackURL: "/dashboard" });
      if (res.error) throw new Error(res.error.message ?? "Sign in failed");
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setGoogleLoading(true);
    setError("");
    try {
      await signIn.social({ provider: "google", callbackURL: "/dashboard" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0e0e0e] selection:bg-primary/30">
      {/* Decorative Background */}
      <div className="fixed inset-0 z-[-1]">
        <div className="absolute inset-0 grid-pattern" />
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute top-[-10%] right-[-10%] w-[40rem] h-[40rem] bg-primary/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-primary/5 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="fixed top-0 w-full z-50">
        <div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 h-20 flex items-center">
          <Link href="/" className="text-xl font-bold tracking-tighter text-white">
            TradinX
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="flex-grow flex items-center justify-center pt-24 pb-12 px-6 md:px-0">
        <div className="w-full max-w-md slide-up">
          <div className="glass-card rounded-xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/20 blur-[60px] rounded-full pointer-events-none" />
            <div className="relative z-10">
              <div className="text-center mb-6">
                <h1 className="text-headline-md font-semibold text-on-surface mb-1">Welcome Back</h1>
                <p className="text-label-sm text-on-surface-variant">Precision insights for your next trade.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1 ml-1" htmlFor="email">
                    Email Address
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">mail</span>
                    <input
                      className="neo-input w-full pl-10 pr-4 py-2.5 rounded-lg text-sm text-on-surface placeholder:text-outline/50 bg-surface-container-low"
                      id="email" name="email" placeholder="name@company.com"
                      required type="email" value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1 ml-1">
                    <label className="text-label-sm text-on-surface-variant" htmlFor="password">Password</label>
                    <a className="text-label-sm text-primary hover:underline transition-all" href="#">Forgot Password?</a>
                  </div>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">lock</span>
                    <input
                      className="neo-input w-full pl-10 pr-4 py-2.5 rounded-lg text-sm text-on-surface placeholder:text-outline/50 bg-surface-container-low"
                      id="password" name="password" placeholder="••••••••"
                      required type="password" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 py-1">
                  <input className="w-4 h-4 rounded border-outline-variant bg-surface-container" id="remember" type="checkbox" />
                  <label className="text-label-md text-on-surface-variant cursor-pointer" htmlFor="remember">Stay signed in</label>
                </div>

                {error && (
                  <div className="fade-in flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M7 4.5v2.5M7 9h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  disabled={loading || googleLoading}
                  className="w-full py-3 bg-primary-container text-label-md rounded-lg primary-btn-glow transition-all duration-300 flex justify-center items-center gap-2 text-white disabled:opacity-60 cursor-pointer border-none"
                  type="submit"
                >
                  {loading ? "Signing In\u2026" : "Sign In"}
                  {!loading && <span className="material-symbols-outlined text-lg">arrow_forward</span>}
                </button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-outline-variant/20" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-4 bg-[#111827] text-xs text-on-surface-variant uppercase tracking-widest">Or continue with</span>
                </div>
              </div>

              <div className="grid gap-4">
                <button
                  type="button" onClick={handleGoogle}
                  disabled={loading || googleLoading}
                  className="w-full py-3 glass-card rounded-lg flex justify-center items-center gap-3 hover:bg-white/5 duration-300 border border-outline-variant/20 cursor-pointer disabled:opacity-60"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M12 5.04c1.64 0 3.12.56 4.28 1.67l3.22-3.22C17.52 1.64 14.95 1 12 1 7.37 1 3.38 3.69 1.48 7.63l3.85 2.99C6.24 7.65 8.89 5.04 12 5.04z" fill="#EA4335" />
                    <path d="M23.49 12.27c0-.8-.07-1.57-.2-2.31H12v4.38h6.45c-.28 1.48-1.12 2.74-2.38 3.58l3.71 2.87c2.17-2 3.71-4.94 3.71-8.52z" fill="#4285F4" />
                    <path d="M5.33 14.62C5.08 13.88 4.95 13.1 4.95 12.3s.13-1.58.38-2.32L1.48 6.99c-.8 1.66-1.25 3.53-1.25 5.51s.45 3.85 1.25 5.51l3.85-3z" fill="#FBBC05" />
                    <path d="M12 23c3.12 0 5.73-1.02 7.65-2.77l-3.71-2.87c-1.08.73-2.47 1.16-3.94 1.16-3.11 0-5.76-2.61-6.67-5.59l-3.85 3C3.38 20.31 7.37 23 12 23z" fill="#34A853" />
                  </svg>
                  <span className="text-label-md text-on-surface">{googleLoading ? "Redirecting\u2026" : "Continue with Google"}</span>
                </button>
              </div>

              <div className="mt-8 text-center">
                <p className="text-on-surface-variant text-label-sm">
                  Don&apos;t have an account?{" "}
                  <Link className="text-primary font-bold hover:text-primary-fixed transition-colors" href="/signup">Sign Up</Link>
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-label-sm text-on-surface-variant">
              By signing in, you agree to our{" "}
              <a className="text-primary hover:underline" href="#">Terms</a>{" "}and{" "}
              <a className="text-primary hover:underline" href="#">Privacy Policy</a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
