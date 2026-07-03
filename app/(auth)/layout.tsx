/**
 * app/(auth)/layout.tsx — Layout for authentication pages.
 * No sidebar — full-page centered design.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4">
      {children}
    </div>
  );
}
