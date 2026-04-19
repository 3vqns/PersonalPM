import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FaceScanCapture } from "../components/FaceScanCapture";
import { GoogleAuthButton } from "../components/GoogleAuthButton";
import { supabase } from "../lib/supabase";
import { getRedirectTarget } from "../lib/redirect";
import { submitFaceScan } from "../lib/faceScan";
import { useAuth } from "../hooks/useAuth";

export function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTarget = getRedirectTarget(location.search);
  const { refreshSession } = useAuth();
  const [step, setStep] = useState<"account" | "face">("account");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords must match.");
      return;
    }

    setSubmitting(true);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            name: form.name,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      await refreshSession();
      setStep("face");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not create your account.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function finishOnboarding() {
    navigate(redirectTarget, { replace: true });
  }

  async function handleFaceCapture(images: Blob[]) {
    await submitFaceScan(images);
    await refreshSession();
    await finishOnboarding();
  }

  if (step === "face") {
    return (
      <div className="page-shell max-w-2xl">
        <FaceScanCapture
          onCapture={handleFaceCapture}
          onSkip={finishOnboarding}
        />
      </div>
    );
  }

  return (
    <div className="page-shell max-w-xl">
      <div className="surface-card p-6 sm:p-8">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
            Create your account
          </p>
          <h1 className="text-4xl text-ink">Start finding your event photos</h1>
          <p className="text-sm leading-6 text-slate">
            Set up PictureMe once, then join any event and open your personal
            gallery in seconds.
          </p>
        </div>

        <div className="mt-8 space-y-5">
          <GoogleAuthButton
            className="secondary-button w-full border-[#d9cdc1] bg-white"
            label="Continue with Google"
            redirectPath={redirectTarget}
            onError={setError}
          />

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[#e6d9cb]" />
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate/70">
              Or with email
            </span>
            <div className="h-px flex-1 bg-[#e6d9cb]" />
          </div>
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSignupSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Full name</span>
            <div className="field-shell">
              <input
                className="field-input"
                value={form.name}
                onChange={(event) =>
                  setForm((value) => ({ ...value, name: event.target.value }))
                }
                placeholder="Jordan Lee"
                required
              />
            </div>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Email</span>
            <div className="field-shell">
              <input
                className="field-input"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((value) => ({ ...value, email: event.target.value }))
                }
                placeholder="you@example.com"
                required
              />
            </div>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Password</span>
            <div className="field-shell">
              <input
                className="field-input"
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((value) => ({ ...value, password: event.target.value }))
                }
                placeholder="Create a password"
                required
                minLength={8}
              />
            </div>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Confirm password</span>
            <div className="field-shell">
              <input
                className="field-input"
                type="password"
                value={form.confirmPassword}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    confirmPassword: event.target.value,
                  }))
                }
                placeholder="Re-enter your password"
                required
                minLength={8}
              />
            </div>
          </label>

          {error ? (
            <div className="flex items-start gap-2 rounded-3xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>{error}</span>
            </div>
          ) : null}

          <button type="submit" className="primary-button w-full" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate">
          Already have an account?{" "}
          <Link className="font-medium text-ink" to={`/login${location.search}`}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
