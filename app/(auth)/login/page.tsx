"use client";

/**
 * app/(auth)/login/page.tsx — Magic Link Login Page
 *
 * Step 1: Collect name + email address → send Magic Link
 * Step 2: Inform user to check email and click the link
 *
 * Styling: glassmorphism card on gradient background, SellerShip-inspired palette.
 */

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { sendOtpAction } from "./actions";
import { Mail, User, ArrowRight, RotateCcw, CheckCircle2, Loader2, Send } from "lucide-react";

type Step = "email" | "sent";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Read URL search params for error messages on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errParam = params.get("error");
    if (errParam) {
      setError(errParam);
    }
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      // We still call sendOtpAction since it wraps signInWithOtp
      const result = await sendOtpAction(email, name);
      if (result.success) {
        setStep("sent");
        setResendCooldown(60);
      } else {
        setError(result.error);
      }
    });
  }

  async function handleResendMagicLink() {
    if (resendCooldown > 0) return;
    setError(null);
    startTransition(async () => {
      const result = await sendOtpAction(email, name);
      if (result.success) {
        setResendCooldown(60);
      } else {
        setError(result.error);
      }
    });
  }

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <div className="w-full max-w-md">
      {/* Logo / Brand */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/30 mb-4">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M6 20L14 8L22 20H6Z" fill="white" fillOpacity="0.9" />
            <circle cx="14" cy="8" r="3" fill="white" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Sarthi AI</h1>
        <p className="text-slate-400 text-sm mt-1">
          Smart listings for Indian sellers
        </p>
      </div>

      {/* Glass Card */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-all ${
              step === "email"
                ? "bg-indigo-500 text-white"
                : "bg-emerald-500 text-white"
            }`}
          >
            {step === "email" ? "1" : <CheckCircle2 size={14} />}
          </div>
          <div className={`h-0.5 flex-1 rounded-full transition-all ${step === "sent" ? "bg-indigo-500" : "bg-white/10"}`} />
          <div
            className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-all ${
              step === "sent"
                ? "bg-indigo-500 text-white"
                : "bg-white/10 text-slate-400"
            }`}
          >
            2
          </div>
        </div>

        {step === "email" ? (
          <>
            <h2 className="text-lg font-semibold text-white mb-1">
              Create your account
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              Enter your name and email to get started
            </p>

            <form onSubmit={handleSendMagicLink} className="space-y-4">
              {/* Name field */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ramesh Kumar"
                    required
                    minLength={2}
                    className="w-full bg-white/8 border border-white/15 text-white placeholder-slate-500 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Email field */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seller@example.com"
                    required
                    className="w-full bg-white/8 border border-white/15 text-white placeholder-slate-500 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                </div>
                <p className="text-slate-500 text-xs mt-1.5 pl-1">
                  A magic login link will be sent to this email
                </p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl p-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending || !isEmailValid || name.trim().length < 2}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-all duration-150 shadow-lg shadow-indigo-600/30 mt-2"
              >
                {isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Sending Link…
                  </>
                ) : (
                  <>
                    Send Login Link
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-6 shadow-inner animate-pulse">
              <Send size={28} className="translate-x-0.5 -translate-y-0.5" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              Check your email
            </h2>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              We sent a secure magic login link to:
              <br />
              <span className="text-indigo-400 font-semibold block mt-1.5">{email}</span>
            </p>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-8 text-left text-xs text-slate-400 space-y-2">
              <p>📌 <strong>How to log in:</strong></p>
              <ul className="list-disc pl-4 space-y-1.5">
                <li>Open the email inbox on your phone or computer.</li>
                <li>Look for a message from Sarthi AI / Supabase.</li>
                <li>Click the login/confirmation button in the email.</li>
                <li>This window will refresh automatically, or you will redirect to the dashboard.</li>
              </ul>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl p-3 mb-6 text-left">
                {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button
                onClick={handleResendMagicLink}
                disabled={resendCooldown > 0 || isPending}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:text-slate-600 disabled:cursor-not-allowed bg-white/5 hover:bg-white/10 px-4 py-2.5 rounded-lg border border-white/10 transition-all font-medium"
              >
                <RotateCcw size={12} />
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend Link"}
              </button>

              <button
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium underline"
              >
                Change email address
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-slate-600 text-xs mt-6">
        By continuing, you agree to our Terms of Service
      </p>
    </div>
  );
}
