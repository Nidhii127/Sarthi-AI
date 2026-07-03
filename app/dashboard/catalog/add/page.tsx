"use client";

/**
 * app/dashboard/catalog/add/page.tsx — Phase 4+5+6: Input Capture & Pipeline Entry
 *
 * Three capture areas:
 *   1. Photo upload (drag-and-drop or click, jpg/png/webp, single file, preview)
 *   2. Voice recorder (MediaRecorder API, idle/recording/recorded states, timer)
 *   3. Text fallback textarea (bilingual placeholder per AGENTS.md §14)
 *
 * On success the API response is stored in localStorage ("sarthi_pending_listing")
 * and the user is navigated to /dashboard/catalog/confirm (Phase 6).
 *
 * Per AGENTS.md §2: single product per session, no image editing.
 * Per AGENTS.md §14: bilingual (Hindi + English) where seller-facing.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Upload,
  ImageIcon,
  Mic,
  MicOff,
  Square,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type RecordingState = "idle" | "requesting" | "recording" | "recorded";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AddProductPage() {
  const router = useRouter();

  // ── Photo state ──
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Voice state ──
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>("audio/webm");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Text state ──
  const [textInput, setTextInput] = useState("");

  // ── API/Loading states ──
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // localStorage key — must match confirm/page.tsx
  const LS_KEY = "sarthi_pending_listing";

  // ─── Photo handlers ────────────────────────────────────────────────────────

  // Revoke object URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  const handlePhotoFile = useCallback((file: File) => {
    setPhotoError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setPhotoError("Only JPG, PNG, or WebP images are accepted.");
      return;
    }
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }, [photoPreviewUrl]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePhotoFile(file);
    // reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handlePhotoFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const removePhoto = () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoError(null);
  };

  // ─── Voice recorder handlers ───────────────────────────────────────────────

  // Clean up timer + stream on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startRecording = async () => {
    setMicError(null);
    setRecordingState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg;codecs=opus";
      setAudioMimeType(mimeType);

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.start(100); // collect chunks every 100ms
      setRecordingSeconds(0);
      setRecordingState("recording");

      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setRecordingState("idle");
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Mic access denied. Please allow microphone permission in your browser, or type below instead."
          : "Could not start recording. Please check your microphone and try again.";
      setMicError(msg);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecordedDuration(recordingSeconds);
    mediaRecorderRef.current?.stop();
    setRecordingState("recorded");
  };

  const resetRecording = () => {
    setAudioBlob(null);
    setRecordingSeconds(0);
    setRecordedDuration(0);
    setRecordingState("idle");
    setMicError(null);
  };

  // ─── Submit ────────────────────────────────────────────────────────────────

  const canSubmit =
    photoFile !== null && (audioBlob !== null || textInput.trim().length > 0);

  const handleGenerate = async () => {
    if (!canSubmit || isLoading) return;
    setIsLoading(true);
    setApiError(null);

    const formData = new FormData();
    formData.append("image", photoFile!);
    
    if (audioBlob) {
      const ext = audioMimeType.includes("ogg") ? "ogg" : "webm";
      formData.append("audio", audioBlob, `recording.${ext}`);
    }
    
    if (textInput.trim().length > 0) {
      formData.append("text", textInput.trim());
    }

    try {
      const res = await fetch("/api/generate-listing", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Listing generation failed / लिस्टिंग बनाने में विफल।");
      }

      // Phase 6: persist to localStorage → navigate to confirmation screen
      localStorage.setItem(LS_KEY, JSON.stringify(data));
      router.push("/dashboard/catalog/confirm");
    } catch (err: any) {
      console.error("[Generate Error]", err);
      setApiError(err.message || "An unexpected error occurred / एक अप्रत्याशित त्रुटि हुई।");
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">
      {/* ── Back + Page header ── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/dashboard/catalog")}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium group"
          id="back-to-catalog-btn"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          Back
        </button>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900">Add Product</h1>
      </div>

      <p className="text-slate-500 text-sm mb-8">
        Upload a photo, record your voice or type — Sarthi AI will generate the listing for you.
        <br />
        <span className="text-slate-400">
          फोटो अपलोड करें, आवाज़ रिकॉर्ड करें या टाइप करें — बाकी काम Sarthi AI करेगा।
        </span>
      </p>

      <div className="space-y-6">
        {/* ══════════════════════════════════════════════════════════════════
            SECTION 1 — Photo Upload
        ══════════════════════════════════════════════════════════════════ */}
        <section
          className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
          aria-labelledby="photo-section-heading"
        >
          <div className="px-6 py-4 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <ImageIcon size={16} className="text-indigo-500" />
              <h2 id="photo-section-heading" className="text-sm font-semibold text-slate-800">
                Product Photo
              </h2>
              <span className="ml-auto text-xs text-slate-400">JPG · PNG · WebP · 1 file only</span>
            </div>
          </div>

          <div className="p-6">
            {photoPreviewUrl ? (
              /* Preview state */
              <div className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreviewUrl}
                    alt="Product preview"
                    className="w-28 h-28 object-cover rounded-xl border border-slate-100 shadow-sm"
                  />
                  <button
                    onClick={removePhoto}
                    className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition-colors"
                    aria-label="Remove photo"
                    id="remove-photo-btn"
                  >
                    <X size={11} />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{photoFile?.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {photoFile ? (photoFile.size / 1024).toFixed(1) + " KB" : ""}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <CheckCircle2 size={13} className="text-emerald-500" />
                    <span className="text-xs text-emerald-600 font-medium">Photo selected</span>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 text-xs text-indigo-600 hover:text-indigo-500 font-medium underline underline-offset-2 transition-colors"
                    id="change-photo-btn"
                  >
                    Change photo
                  </button>
                </div>
              </div>
            ) : (
              /* Drop zone */
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-10 px-6 cursor-pointer transition-all duration-150 ${
                  isDragging
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                }`}
                id="photo-drop-zone"
                aria-label="Upload product photo — click or drag and drop"
              >
                <div className={`flex items-center justify-center w-12 h-12 rounded-2xl transition-colors ${isDragging ? "bg-indigo-100" : "bg-slate-100"}`}>
                  <Upload size={22} className={isDragging ? "text-indigo-500" : "text-slate-400"} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    {isDragging ? "Drop it here!" : "Click to upload or drag & drop"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">JPG, PNG or WebP · Max one photo</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    एक प्रोडक्ट की फोटो अपलोड करें
                  </p>
                </div>
              </div>
            )}

            {/* Photo error */}
            {photoError && (
              <div className="flex items-start gap-2 mt-3 text-red-600 text-xs bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                {photoError}
              </div>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileInputChange}
            id="photo-file-input"
          />
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 2 — Voice Recorder
        ══════════════════════════════════════════════════════════════════ */}
        <section
          className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
          aria-labelledby="voice-section-heading"
        >
          <div className="px-6 py-4 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <Mic size={16} className="text-indigo-500" />
              <h2 id="voice-section-heading" className="text-sm font-semibold text-slate-800">
                Voice Input
              </h2>
              <span className="ml-auto text-xs text-slate-400">Hindi · Hinglish · Any Indian language</span>
            </div>
          </div>

          <div className="p-6">
            {/* Idle state */}
            {recordingState === "idle" && (
              <div className="flex flex-col items-center gap-4 py-4">
                <p className="text-sm text-slate-600 text-center">
                  Apne product ke baare mein bol ke batao
                  <br />
                  <span className="text-xs text-slate-400">
                    अपने प्रोडक्ट के बारे में बोल के बताएं
                  </span>
                </p>
                <button
                  onClick={startRecording}
                  id="start-recording-btn"
                  className="flex items-center gap-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-2xl text-sm transition-all shadow-lg shadow-indigo-600/25 hover:-translate-y-0.5"
                >
                  <Mic size={17} />
                  Bol ke batao / Start Recording
                </button>
              </div>
            )}

            {/* Requesting mic permission */}
            {recordingState === "requesting" && (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-600 animate-pulse">
                  <Mic size={22} />
                </div>
                <p className="text-sm text-slate-500">Requesting microphone access…</p>
              </div>
            )}

            {/* Recording state */}
            {recordingState === "recording" && (
              <div className="flex flex-col items-center gap-4 py-4">
                {/* Pulsing red indicator */}
                <div className="relative flex items-center justify-center w-16 h-16">
                  <span className="absolute w-16 h-16 rounded-full bg-red-400 opacity-30 animate-ping" />
                  <span className="absolute w-12 h-12 rounded-full bg-red-400 opacity-20 animate-ping animation-delay-150" />
                  <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-red-500 shadow-lg shadow-red-500/30">
                    <Mic size={18} className="text-white" />
                  </div>
                </div>

                {/* Timer */}
                <div className="text-center">
                  <p className="text-2xl font-mono font-bold text-slate-800 tabular-nums">
                    {formatTime(recordingSeconds)}
                  </p>
                  <p className="text-xs text-red-500 font-semibold mt-0.5 tracking-wide uppercase">
                    Recording…
                  </p>
                </div>

                <button
                  onClick={stopRecording}
                  id="stop-recording-btn"
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all shadow-md shadow-red-500/25"
                >
                  <Square size={14} fill="white" />
                  Stop Recording
                </button>
              </div>
            )}

            {/* Recorded state */}
            {recordingState === "recorded" && (
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex-shrink-0">
                  <CheckCircle2 size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Recording saved</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Duration: {formatTime(recordedDuration)}
                  </p>
                </div>
                <button
                  onClick={resetRecording}
                  id="re-record-btn"
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
                >
                  <RotateCcw size={12} />
                  Re-record
                </button>
              </div>
            )}

            {/* Mic error (non-blocking) */}
            {micError && (
              <div className="flex items-start gap-2 mt-4 text-amber-700 text-xs bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                <MicOff size={13} className="mt-0.5 flex-shrink-0" />
                <span>{micError}</span>
              </div>
            )}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 3 — Text Fallback
        ══════════════════════════════════════════════════════════════════ */}
        <section
          className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
          aria-labelledby="text-section-heading"
        >
          <div className="px-6 py-4 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-indigo-500">
                <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <h2 id="text-section-heading" className="text-sm font-semibold text-slate-800">
                Type Instead <span className="font-normal text-slate-400">/ Text Fallback</span>
              </h2>
            </div>
          </div>

          <div className="p-6">
            <textarea
              id="text-input-area"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              rows={5}
              placeholder="Ya yahan type karein... / Type here instead&#10;&#10;Example: Blue cotton kurti, size S to XL, price ₹450, full sleeve, round neck, casual wear"
              className="w-full text-sm text-slate-800 placeholder-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all leading-relaxed"
            />
            <p className="text-xs text-slate-400 mt-2 pl-1">
              {textInput.length} characters · Hindi, Hinglish, or English — sab chalega
            </p>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            GENERATE LISTING BUTTON
        ══════════════════════════════════════════════════════════════════ */}
        <div className="pb-8">
          {/* API Error Alert */}
          {apiError && (
            <div className="flex items-start gap-2.5 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl p-4 mb-4 shadow-sm">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-red-500" />
              <div>
                <p className="font-semibold">Generation Error / निर्माण त्रुटि</p>
                <p className="text-xs text-red-500/90 mt-0.5">{apiError}</p>
              </div>
            </div>
          )}

          {/* Validation hint when button is disabled */}
          {!canSubmit && !isLoading && (
            <p className="text-center text-xs text-slate-400 mb-3">
              {!photoFile
                ? "Photo zaroori hai / A product photo is required"
                : "Voice record karein ya kuch type karein / Record or type a description to continue"}
            </p>
          )}

          <button
            onClick={handleGenerate}
            disabled={!canSubmit || isLoading}
            id="generate-listing-btn"
            className="w-full flex items-center justify-center gap-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none text-white font-bold py-4 rounded-2xl text-base transition-all duration-150 shadow-xl shadow-indigo-600/25 hover:shadow-indigo-500/30 hover:-translate-y-0.5 disabled:translate-y-0"
          >
            {isLoading ? (
              <>
                <Loader2 size={19} className="animate-spin text-white" />
                Generating Listing... / लिस्टिंग बनाई जा रही है...
              </>
            ) : (
              <>
                <Sparkles size={19} className={canSubmit ? "text-indigo-200" : "text-slate-400"} />
                Generate Listing / लिस्टिंग बनाएं
              </>
            )}
          </button>
        </div>
      </div>

      {/* Premium Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl text-white">
            <div className="flex justify-center mb-6">
              <div className="relative flex items-center justify-center w-16 h-16">
                <span className="absolute w-16 h-16 rounded-full bg-indigo-500/30 opacity-30 animate-ping" />
                <span className="absolute w-12 h-12 rounded-full bg-indigo-500/20 opacity-20 animate-ping" />
                <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/30">
                  <Loader2 size={20} className="animate-spin text-white" />
                </div>
              </div>
            </div>
            <h3 className="text-lg font-bold">Creating Listing...</h3>
            <p className="text-sm text-slate-300 mt-1">Sarthi AI is processing your photo & voice note.</p>
            <div className="h-px bg-white/10 my-4" />
            <p className="text-xs text-indigo-300 font-medium">
              लिस्टिंग बनाई जा रही है, कृपया प्रतीक्षा करें...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
