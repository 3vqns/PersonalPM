import { AlertCircle, Crown, ShieldCheck, Trash2, User } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { ShareEventPanel } from "../components/ShareEventPanel";
import { Spinner } from "../components/Spinner";
import { apiFetch } from "../lib/api";
import { formatDate } from "../lib/date";
import type { EventDetail, EventMember } from "../types";

export function EventSettingsPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [members, setMembers] = useState<EventMember[]>([]);
  const [form, setForm] = useState({
    name: "",
    date: "",
    description: "",
    allowAnyoneUpload: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      try {
        const [eventResponse, membersResponse] = await Promise.all([
          apiFetch<EventDetail>(`/api/events/${id}`),
          apiFetch<EventMember[]>(`/api/events/${id}/members`),
        ]);

        if (eventResponse.role !== "creator") {
          navigate(`/event/${id}?denied=1`, { replace: true });
          return;
        }

        setEvent(eventResponse);
        setMembers(membersResponse);
        setForm({
          name: eventResponse.name,
          date: eventResponse.date,
          description: eventResponse.description ?? "",
          allowAnyoneUpload: eventResponse.allowAnyoneUpload ?? false,
        });
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "PictureMe could not load event settings.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();
  }, [id, navigate]);

  async function handleSave(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch<EventDetail>(`/api/events/${id}`, {
        method: "PATCH",
        body: {
          name: form.name,
          date: form.date,
          description: form.description,
          allow_anyone_upload: form.allowAnyoneUpload,
        },
      });
      setEvent(response);
      setSuccess("Event details updated.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not save these changes.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleToggle(member: EventMember) {
    const nextRole = member.role === "admin" ? "member" : "admin";
    const currentMembers = members;
    setMembers((list) =>
      list.map((item) =>
        item.userId === member.userId ? { ...item, role: nextRole } : item,
      ),
    );

    try {
      await apiFetch(`/api/events/${id}/members/${member.userId}`, {
        method: "PATCH",
        body: { role: nextRole },
      });
    } catch (requestError) {
      setMembers(currentMembers);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not update this role.",
      );
    }
  }

  async function handleDeleteEvent() {
    await apiFetch(`/api/events/${id}`, { method: "DELETE" });
    navigate("/dashboard", { replace: true });
  }

  if (loading) {
    return (
      <div className="page-shell flex min-h-[60vh] items-center justify-center">
        <Spinner label="Loading event settings..." />
      </div>
    );
  }

  if (error && !event) {
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

  if (!event) {
    return null;
  }

  return (
    <div className="page-shell space-y-6">
      {deleteOpen ? (
        <Modal title="Delete event" onClose={() => setDeleteOpen(false)} className="sm:max-w-lg">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate">
              Deleting this event removes the gallery, QR code, and member access.
              This action cannot be undone.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="secondary-button flex-1"
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button flex-1 bg-red-600 hover:bg-red-700"
                onClick={() => void handleDeleteEvent()}
              >
                Delete event
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      <section className="surface-card space-y-5 p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
            Event settings
          </p>
          <h1 className="text-4xl text-ink">{event.name}</h1>
          <p className="mt-2 text-sm text-slate">
            Gallery date: {formatDate(event.date)}
          </p>
        </div>

        <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleSave}>
          <label className="block space-y-2 lg:col-span-2">
            <span className="text-sm font-medium text-ink">Event name</span>
            <div className="field-shell">
              <input
                className="field-input"
                value={form.name}
                onChange={(inputEvent) =>
                  setForm((value) => ({ ...value, name: inputEvent.target.value }))
                }
                required
              />
            </div>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-ink">Event date</span>
            <div className="field-shell">
              <input
                className="field-input"
                type="date"
                value={form.date}
                onChange={(inputEvent) =>
                  setForm((value) => ({ ...value, date: inputEvent.target.value }))
                }
                required
              />
            </div>
          </label>
          <label className="block space-y-2 lg:col-span-2">
            <span className="text-sm font-medium text-ink">Description</span>
            <div className="field-shell">
              <textarea
                className="field-input min-h-28 resize-none"
                value={form.description}
                onChange={(inputEvent) =>
                  setForm((value) => ({
                    ...value,
                    description: inputEvent.target.value,
                  }))
                }
              />
            </div>
          </label>

          {/* Allow anyone to upload toggle */}
          <label className="flex cursor-pointer items-start gap-4 rounded-[28px] border border-ink/10 p-4 lg:col-span-2 hover:bg-ink/[0.02] transition">
            <div className="flex h-5 items-center">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-seafoam-500 cursor-pointer"
                checked={form.allowAnyoneUpload}
                onChange={(inputEvent) =>
                  setForm((value) => ({
                    ...value,
                    allowAnyoneUpload: inputEvent.target.checked,
                  }))
                }
              />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">Allow anyone to upload photos</p>
              <p className="mt-0.5 text-xs leading-5 text-slate">
                When enabled, guests who open the event link without signing in can upload photos to this gallery.
              </p>
            </div>
          </label>
          <div className="lg:col-span-2 flex flex-col gap-3 sm:flex-row">
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => navigate(`/event/${id}`)}
            >
              Back to gallery
            </button>
          </div>
          {success ? <p className="text-sm text-seafoam-600">{success}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </form>
      </section>

      <ShareEventPanel eventName={event.name} joinToken={event.joinToken} />

      <section className="surface-card space-y-5 p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
            Members
          </p>
          <h2 className="text-3xl text-ink">Access and upload roles</h2>
        </div>
        <div className="space-y-3">
          {members.map((member) => {
            const isCreator = member.userId === event.creator.id || member.role === "creator";
            return (
              <div
                key={member.id}
                className="flex flex-col gap-4 rounded-[28px] border border-ink/10 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-ink">{member.name}</p>
                  <p className="text-sm text-slate">{member.email}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <span className="inline-flex items-center gap-2 rounded-full bg-ivory px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                    {isCreator ? (
                      <Crown className="h-3.5 w-3.5 text-amber-500" />
                    ) : member.role === "admin" ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-seafoam-500" />
                    ) : (
                      <User className="h-3.5 w-3.5 text-slate" />
                    )}
                    {isCreator ? "Creator" : member.role}
                  </span>
                  {!isCreator ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void handleRoleToggle(member)}
                    >
                      {member.role === "admin" ? "Remove admin" : "Make admin"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="surface-card border border-red-100 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-500">
              Danger zone
            </p>
            <h2 className="mt-2 text-2xl text-ink">Delete this event</h2>
            <p className="mt-2 text-sm leading-6 text-slate">
              Remove the event, member list, and gallery access for everyone.
            </p>
          </div>
          <button
            type="button"
            className="secondary-button border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete event
          </button>
        </div>
      </section>
    </div>
  );
}
