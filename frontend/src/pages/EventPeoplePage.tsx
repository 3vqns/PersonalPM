import {
  AlertCircle,
  Check,
  Crown,
  MailPlus,
  ShieldCheck,
  Trash2,
  User,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Spinner } from "../components/Spinner";
import { apiFetch } from "../lib/api";
import { formatDate } from "../lib/date";
import type {
  EventPeopleResponse,
  EventPerson,
  GalleryAccessEntry,
} from "../types";

export function EventPeoplePage() {
  const { id = "" } = useParams();
  const [peopleResponse, setPeopleResponse] = useState<EventPeopleResponse | null>(null);
  const [accessRows, setAccessRows] = useState<GalleryAccessEntry[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const event = peopleResponse?.event;
  const members = useMemo(
    () => peopleResponse?.people.filter((person) => person.kind === "member") ?? [],
    [peopleResponse],
  );
  const anonymousUploaders = useMemo(
    () => peopleResponse?.people.filter((person) => person.kind === "anonymous") ?? [],
    [peopleResponse],
  );

  useEffect(() => {
    void loadPeople();
  }, [id]);

  async function loadPeople() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<EventPeopleResponse>(`/api/events/${id}/people`);
      setPeopleResponse(response);
      if (response.event.role === "creator") {
        const accessResponse = await apiFetch<GalleryAccessEntry[]>(
          `/api/events/${id}/gallery-access`,
        );
        setAccessRows(accessResponse);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not load this people list.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    if (!inviteEmail.trim()) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiFetch<GalleryAccessEntry>(
        `/api/events/${id}/gallery-access`,
        {
          method: "POST",
          body: { email: inviteEmail.trim() },
        },
      );
      setAccessRows((rows) => [
        response,
        ...rows.filter((row) => row.user.id !== response.user.id),
      ]);
      setInviteEmail("");
      setSuccess("Gallery access added.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not add gallery access.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(row: GalleryAccessEntry) {
    await updateAccess(row.user.id, "approved");
  }

  async function updateAccess(userId: string, status: "approved" | "pending") {
    setError(null);
    try {
      const response = await apiFetch<GalleryAccessEntry>(
        `/api/events/${id}/gallery-access/${userId}`,
        {
          method: "PATCH",
          body: { status },
        },
      );
      setAccessRows((rows) =>
        rows.map((row) => (row.user.id === userId ? response : row)),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not update gallery access.",
      );
    }
  }

  async function handleRemoveAccess(userId: string) {
    setError(null);
    try {
      await apiFetch(`/api/events/${id}/gallery-access/${userId}`, {
        method: "DELETE",
      });
      setAccessRows((rows) => rows.filter((row) => row.user.id !== userId));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not remove gallery access.",
      );
    }
  }

  if (loading) {
    return (
      <div className="page-shell flex min-h-[60vh] items-center justify-center">
        <Spinner label="Loading people..." />
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="page-shell max-w-2xl">
        <div className="surface-card flex gap-3 p-6">
          <AlertCircle className="mt-1 h-5 w-5 text-red-600" />
          <div>
            <h1 className="text-2xl text-ink">People unavailable</h1>
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
      <section className="surface-card space-y-5 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
              People
            </p>
            <h1 className="text-4xl text-ink">{event.name}</h1>
            <p className="mt-2 text-sm text-slate">
              {formatDate(event.date)} · {members.length} signed-in{" "}
              {members.length === 1 ? "person" : "people"}
              {anonymousUploaders.length
                ? ` · ${anonymousUploaders.length} anonymous uploader${
                    anonymousUploaders.length === 1 ? "" : "s"
                  }`
                : ""}
            </p>
          </div>
          <Link className="secondary-button" to={`/event/${id}`}>
            Back to gallery
          </Link>
        </div>
      </section>

      {event.role === "creator" ? (
        <section className="surface-card space-y-5 p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
              Gallery access
            </p>
            <h2 className="text-3xl text-ink">Private access list</h2>
            <p className="mt-2 text-sm leading-6 text-slate">
              Add signed-up PictureMe users by email, approve requests, or remove access.
            </p>
          </div>

          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleInvite}>
            <div className="field-shell flex-1">
              <input
                className="field-input"
                type="email"
                value={inviteEmail}
                placeholder="person@example.com"
                onChange={(inputEvent) => setInviteEmail(inputEvent.target.value)}
              />
            </div>
            <button type="submit" className="primary-button" disabled={saving}>
              <MailPlus className="mr-2 h-4 w-4" />
              {saving ? "Adding..." : "Add access"}
            </button>
          </form>

          <div className="space-y-3">
            {accessRows.length ? (
              accessRows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-4 rounded-lg border border-ink/10 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-ink">{row.user.name}</p>
                    <p className="text-sm text-slate">{row.user.email}</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <span className="rounded-full bg-ivory px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
                      {row.status}
                    </span>
                    {row.status === "pending" ? (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void handleApprove(row)}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Approve
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="secondary-button border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => void handleRemoveAccess(row.user.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-lg bg-ivory/70 p-4 text-sm text-slate">
                No private-gallery access rows yet.
              </p>
            )}
          </div>
          {success ? <p className="text-sm text-seafoam-700">{success}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </section>
      ) : null}

      <section className="surface-card space-y-5 p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
            Event list
          </p>
          <h2 className="text-3xl text-ink">Signed-in people</h2>
        </div>
        <div className="space-y-3">
          {members.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </div>
      </section>

      <section className="surface-card space-y-5 p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
            Anonymous
          </p>
          <h2 className="text-3xl text-ink">Anonymous uploaders</h2>
        </div>
        {anonymousUploaders.length ? (
          <div className="space-y-3">
            {anonymousUploaders.map((person) => (
              <PersonRow key={person.id} person={person} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg bg-ivory/70 p-4 text-sm text-slate">
            No anonymous uploads have been submitted.
          </p>
        )}
      </section>
    </div>
  );
}

function PersonRow({ person }: { person: EventPerson }) {
  const isCreator = person.role === "creator";
  const isAdmin = person.role === "admin";
  const isAnonymous = person.kind === "anonymous";

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-ink/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ivory text-ink">
          {isCreator ? (
            <Crown className="h-4 w-4 text-amber-500" />
          ) : isAdmin ? (
            <ShieldCheck className="h-4 w-4 text-seafoam-500" />
          ) : isAnonymous ? (
            <UserRound className="h-4 w-4 text-slate" />
          ) : (
            <User className="h-4 w-4 text-slate" />
          )}
        </div>
        <div>
          <p className="font-medium text-ink">{person.name}</p>
          <p className="text-sm text-slate">
            {person.email ?? "Anonymous uploader"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-ivory px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
          {isAnonymous ? "Anonymous" : person.role}
        </span>
        {person.galleryAccessStatus ? (
          <span className="rounded-full bg-seafoam-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-seafoam-700">
            {person.galleryAccessStatus}
          </span>
        ) : null}
        <span className="rounded-full bg-ivory px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate">
          {person.uploadCount} uploads
        </span>
      </div>
    </div>
  );
}
