import { AlertCircle, Camera, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { FaceScanCapture } from "../components/FaceScanCapture";
import { Modal } from "../components/Modal";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { getInitials } from "../lib/date";
import { submitFaceScan } from "../lib/faceScan";
import type { AccountResponse } from "../types";

export function AccountSettingsPage() {
  const { refreshSession } = useAuth();
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [form, setForm] = useState({
    name: "",
    avatar: null as File | null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function loadAccount() {
    setLoading(true);
    try {
      const response = await apiFetch<AccountResponse>("/api/account");
      setAccount(response);
      setForm({
        name: response.user.name,
        avatar: null,
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not load your account settings.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccount();
  }, []);

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("name", form.name);
    if (form.avatar) {
      formData.append("avatar", form.avatar);
    }

    try {
      const response = await apiFetch<AccountResponse>("/api/account/profile", {
        method: "PATCH",
        body: formData,
      });
      setAccount(response);
      setSuccess("Profile updated.");
      await refreshSession();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not update your profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleFaceCapture(images: Blob[]) {
    await submitFaceScan(images);
    await refreshSession();
    setCaptureOpen(false);
    await loadAccount();
    setSuccess("Face profile updated.");
  }

  async function handleDeleteFaceProfile() {
    await apiFetch("/api/account/face-profile", {
      method: "DELETE",
    });
    setDeleteOpen(false);
    await refreshSession();
    await loadAccount();
    setSuccess("Face profile removed.");
  }

  if (loading) {
    return (
      <div className="page-shell flex min-h-[60vh] items-center justify-center">
        <Spinner label="Loading your account..." />
      </div>
    );
  }

  if (error && !account) {
    return (
      <div className="page-shell max-w-2xl">
        <div className="surface-card flex gap-3 p-6">
          <AlertCircle className="mt-1 h-5 w-5 text-red-600" />
          <div>
            <h1 className="text-2xl text-ink">Settings unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-slate">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!account) {
    return null;
  }

  return (
    <div className="page-shell space-y-6">
      {deleteOpen ? (
        <Modal title="Delete face profile" onClose={() => setDeleteOpen(false)} className="sm:max-w-lg">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate">
              This removes your face profile and clears you from all matched photos
              until you scan again.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="secondary-button flex-1"
                onClick={() => setDeleteOpen(false)}
              >
                Keep face profile
              </button>
              <button
                type="button"
                className="primary-button flex-1 bg-red-600 hover:bg-red-700"
                onClick={() => void handleDeleteFaceProfile()}
              >
                Delete face profile
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      <section className="surface-card space-y-5 p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
            Account settings
          </p>
          <h1 className="text-4xl text-ink">Profile</h1>
        </div>

        <form className="space-y-4" onSubmit={handleProfileSave}>
          <div className="flex items-center gap-4">
            {account.user.avatarUrl ? (
              <img
                src={account.user.avatarUrl}
                alt={account.user.name}
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-seafoam-100 text-2xl font-semibold text-seafoam-600">
                {getInitials(account.user.name)}
              </div>
            )}
            <div>
              <p className="font-medium text-ink">{account.user.email}</p>
              <p className="text-sm text-slate">Update your display details here.</p>
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Name</span>
            <div className="field-shell">
              <input
                className="field-input"
                value={form.name}
                onChange={(event) =>
                  setForm((value) => ({ ...value, name: event.target.value }))
                }
                required
              />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Avatar</span>
            <div className="field-shell">
              <input
                className="field-input"
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    avatar: event.target.files?.[0] ?? null,
                  }))
                }
              />
            </div>
          </label>

          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving..." : "Save profile"}
          </button>
          {success ? <p className="text-sm text-seafoam-600">{success}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </form>
      </section>

      <section className="surface-card space-y-5 p-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
            Face profile
          </p>
          <h2 className="text-3xl text-ink">Manage your matching identity</h2>
          <p className="text-sm leading-6 text-slate">
            PictureMe uses your face profile to populate My Photos across every
            event you join.
          </p>
        </div>

        {captureOpen ? (
          <FaceScanCapture
            onCapture={handleFaceCapture}
            onSkip={() => setCaptureOpen(false)}
            title={account.user.hasFaceProfile ? "Retake your face scan" : "Complete your face profile"}
          />
        ) : (
          <div className="rounded-[28px] border border-ink/10 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                    account.user.hasFaceProfile
                      ? "bg-seafoam-50 text-seafoam-600"
                      : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {account.user.hasFaceProfile ? "Face profile active" : "Face profile inactive"}
                </span>
                <p className="mt-3 text-sm leading-6 text-slate">
                  {account.user.hasFaceProfile
                    ? "Retake your scan if your appearance has changed or you want a cleaner reference photo."
                    : "Add a face scan to unlock automatic matching in My Photos."}
                </p>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => setCaptureOpen(true)}
              >
                <Camera className="mr-2 h-4 w-4" />
                {account.user.hasFaceProfile ? "Retake face scan" : "Complete your face profile"}
              </button>
            </div>
            {account.user.hasFaceProfile ? (
              <button
                type="button"
                className="ghost-button mt-4 px-0 text-red-600"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete face profile
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
