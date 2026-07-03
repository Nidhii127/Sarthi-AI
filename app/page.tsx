import { redirect } from "next/navigation";

/**
 * Root page — redirects to /dashboard.
 * Middleware handles unauthenticated redirect to /login before this runs.
 */
export default function RootPage() {
  redirect("/dashboard");
}
