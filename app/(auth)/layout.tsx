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
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] p-4">
      {children}
    </div>
  );
}
