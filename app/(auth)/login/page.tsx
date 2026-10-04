"use client";

/**
 * app/(auth)/login/page.tsx — Firebase Email/Password Authentication
 *
 * Supports:
 *   - Sign in with email and password
 *   - New seller account signup (email, password, display name)
 *   - Password reset email delivery
 *   - Client-side session persistence via Firebase Auth
 *
 * Styling: glassmorphism card on gradient background, SellerShip-inspired palette.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  Mail,
  User,
  Lock,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
  ArrowLeft,
  KeyRound,
} from "lucide-react";

type AuthMode = "login" | "signup" | "reset";

function getFirebaseErrorMessage(error: any): string {
  const code = error?.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support.";
    case "auth/user-not-found":
      return "No account found with this email. Please create an account.";
    case "auth/wrong-password":
      return "Incorrect password. Please try again or reset your password.";
    case "auth/invalid-credential":
      return "Invalid email or password. Please verify your credentials.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Please sign in instead.";
    case "auth/weak-password":
      return "Password is too weak. Please use at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";
    default:
      return error?.message || "An unexpected error occurred. Please try again.";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isPasswordValid = password.length >= 6;
  const isNameValid = mode !== "signup" || name.trim().length >= 2;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetSent(false);

    if (!isEmailValid) {
      setError("Please enter a valid email address.");
      return;
    }

    if (mode === "reset") {
      setLoading(true);
      try {
        await sendPasswordResetEmail(auth, email.trim());
        setResetSent(true);
      } catch (err: any) {
        setError(getFirebaseErrorMessage(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!isPasswordValid) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (mode === "signup" && !isNameValid) {
      setError("Please enter your full name (at least 2 characters).");
      return;
    }

    setLoading(true);

    try {
      let user = null;
      if (mode === "login") {
        const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        user = userCredential.user;
      } else if (mode === "signup") {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        user = userCredential.user;
        if (name.trim()) {
          try {
            await updateProfile(user, {
              displayName: name.trim(),
            });
          } catch (profileErr) {
            console.warn("Could not set display name:", profileErr);
          }
        }
      }

      if (user) {
        // Exchange ID token for secure HttpOnly server session cookie
        const idToken = await user.getIdToken(true);
        const sessionRes = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });

        if (!sessionRes.ok) {
          const data = await sessionRes.json().catch(() => ({}));
          throw new Error(data.error || "Failed to establish server session. Please try again.");
        }

        router.push("/dashboard/catalog");
        router.refresh();
      }
    } catch (err: any) {
      setError(getFirebaseErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-[#e11b4c] mb-3">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <path d="M6 20L14 8L22 20H6Z" fill="white" fillOpacity="0.9" />
            <circle cx="14" cy="8" r="3" fill="white" />
          </svg>
        </div>
        <h1 className="font-display text-2xl font-bold text-[#17181c] tracking-tight">Saarthi</h1>
        <p className="text-[#585b66] text-sm mt-1">
          Smart listings for Indian sellers
        </p>
      </div>

      {/* Commerce Card */}
      <div className="bg-white border border-[#e6e6ea] rounded-lg p-8 shadow-sm">
        {mode !== "reset" ? (
          <>
            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 p-1 bg-[#f5f5f7] rounded-md border border-[#e6e6ea] mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-all ${
                  mode === "login"
                    ? "bg-white text-[#17181c] shadow-sm"
                    : "text-[#585b66] hover:text-[#17181c]"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-all ${
                  mode === "signup"
                    ? "bg-white text-[#17181c] shadow-sm"
                    : "text-[#585b66] hover:text-[#17181c]"
                }`}
              >
                Create Account
              </button>
            </div>

            <div className="mb-6">
              <h2 className="text-lg font-semibold text-[#17181c] mb-1">
                {mode === "login" ? "Welcome back" : "Create seller account"}
              </h2>
              <p className="text-[#585b66] text-sm">
                {mode === "login"
                  ? "Enter your credentials to access your dashboard"
                  : "Sign up to start creating AI-assisted listings"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name field (signup only) */}
              {mode === "signup" && (
                <div>
                  <label className="block text-sm font-medium text-[#17181c] mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8f9c]"
                    />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ramesh Kumar"
                      required
                      minLength={2}
                      className="w-full bg-white border border-[#e6e6ea] text-[#17181c] placeholder-[#8c8f9c] rounded-md pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e11b4c] focus:border-[#e11b4c] transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Email field */}
              <div>
                <label className="block text-sm font-medium text-[#17181c] mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8f9c]"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seller@example.com"
                    required
                    className="w-full bg-white border border-[#e6e6ea] text-[#17181c] placeholder-[#8c8f9c] rounded-md pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e11b4c] focus:border-[#e11b4c] transition-colors"
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-[#17181c]">
                    Password
                  </label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("reset");
                        setError(null);
                        setResetSent(false);
                      }}
                      className="text-xs text-[#e11b4c] hover:text-[#c9143f] font-medium transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8f9c]"
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full bg-white border border-[#e6e6ea] text-[#17181c] placeholder-[#8c8f9c] rounded-md pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e11b4c] focus:border-[#e11b4c] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8c8f9c] hover:text-[#17181c] transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {mode === "signup" && (
                  <p className="text-[#8c8f9c] text-xs mt-1.5 pl-1">
                    At least 6 characters
                  </p>
                )}
              </div>

              {/* Error Alert */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={
                  loading ||
                  !isEmailValid ||
                  !isPasswordValid ||
                  (mode === "signup" && !isNameValid)
                }
                className="w-full flex items-center justify-center gap-2 bg-[#e11b4c] hover:bg-[#c9143f] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-md py-2.5 text-sm transition-colors shadow-sm mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {mode === "login" ? "Signing In…" : "Creating Account…"}
                  </>
                ) : (
                  <>
                    {mode === "login" ? "Sign In" : "Create Account"}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </>
        ) : (
          /* Password Reset View */
          <div>
            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setResetSent(false);
                }}
                className="text-[#585b66] hover:text-[#17181c] transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
              <h2 className="text-lg font-semibold text-[#17181c]">Reset Password</h2>
            </div>
            <p className="text-[#585b66] text-sm mb-6">
              Enter your email address and we will send you a password reset link.
            </p>

            {resetSent ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-md p-4 flex items-start gap-3">
                  <CheckCircle2
                    size={20}
                    className="text-emerald-600 mt-0.5 shrink-0"
                  />
                  <div className="text-sm">
                    <p className="font-semibold text-emerald-800">
                      Reset link sent
                    </p>
                    <p className="text-emerald-700 text-xs mt-1">
                      If an account exists for{" "}
                      <span className="text-[#17181c] font-medium">{email}</span>,
                      you will receive an email shortly with reset instructions.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                    setResetSent(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-[#f5f5f7] hover:bg-[#e6e6ea] text-[#17181c] font-semibold rounded-md py-2.5 text-sm transition-colors border border-[#e6e6ea]"
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#17181c] mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8f9c]"
                    />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seller@example.com"
                      required
                      className="w-full bg-white border border-[#e6e6ea] text-[#17181c] placeholder-[#8c8f9c] rounded-md pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#e11b4c] focus:border-[#e11b4c] transition-colors"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !isEmailValid}
                  className="w-full flex items-center justify-center gap-2 bg-[#e11b4c] hover:bg-[#c9143f] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-md py-2.5 text-sm transition-colors shadow-sm mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sending Link…
                    </>
                  ) : (
                    <>
                      <KeyRound size={16} />
                      Send Reset Link
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                    className="text-xs text-[#585b66] hover:text-[#17181c] transition-colors"
                  >
                    Cancel and return to sign in
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      <p className="text-center text-[#8c8f9c] text-xs mt-6">
        By continuing, you agree to our Terms of Service
      </p>
    </div>
  );
}
