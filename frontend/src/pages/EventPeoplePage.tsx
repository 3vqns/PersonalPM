import {
  AlertCircle,
  Crown,
  ShieldCheck,
  Trash2,
  User,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Spinner } from "../components/Spinner";
import { apiFetch } from "../lib/api";
import { formatDate } from "../lib/date";
import type {
  EventPeopleResponse,
  EventPerson,
  EventRole,
} from "../types";

type PeopleTab = "users" | "anonymous";

export function EventPeoplePage() {
  const { id = "" } = useParams();
  const [peopleResponse, setPeopleResponse] = useState<EventPeopleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PeopleTab>("users");

  const event = peopleResponse?.event;
  const members = useMemo(
    () => peopleResponse?.people.filter((person) => person.kind === "member") ?? [],
    [peopleResponse],
  );
  const anonymousUploaders = useMemo(
    () => peopleResponse?.people.filter((person) => person.kind === "anonymous") ?? [],
    [peopleResponse],
  );
  const canManageRoles = event?.role === "creator";
  const canRemoveMembers = event?.role === "creator" || event?.role === "admin";
  const tabs = useMemo(
    () =>
      [
        { id: "users" as const, label: "Users", count: members.length },
        { id: "anonymous" as const, label: "Anonymous Users", count: anonymousUploaders.length },
      ],
    [anonymousUploaders.length, members.length],
  );

  useEffect(() => {
    void loadPeople();
  }, [id]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("users");
    }
  }, [activeTab, tabs]);

  async function loadPeople() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<EventPeopleResponse>(`/api/events/${id}/people`);
      setPeopleResponse(response);
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

  async function handleRoleToggle(person: EventPerson) {
    if (!person.role || person.role === "creator") {
      return;
    }

    const nextRole: EventRole = person.role === "admin" ? "member" : "admin";
    const currentResponse = peopleResponse;
    setPeopleResponse((response) =>
      response
        ? {
            ...response,
            people: response.people.map((item) =>
              item.id === person.id ? { ...item, role: nextRole } : item,
            ),
          }
        : response,
    );

    try {
      await apiFetch(`/api/events/${id}/members/${person.id}`, {
        method: "PATCH",
        body: { role: nextRole },
      });
    } catch (requestError) {
      setPeopleResponse(currentResponse);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not update this role.",
      );
    }
  }

  async function handleRemoveMember(person: EventPerson) {
    if (person.role === "creator" || person.kind === "anonymous") {
      return;
    }

    const confirmed = window.confirm(`Remove ${person.name} from this event?`);
    if (!confirmed) {
      return;
    }

    const currentResponse = peopleResponse;
    setPeopleResponse((response) =>
      response
        ? {
            ...response,
            people: response.people.filter((item) => item.id !== person.id),
          }
        : response,
    );
    setError(null);

    try {
      await apiFetch(`/api/events/${id}/members/${person.id}`, {
        method: "DELETE",
      });
      setSuccess(`${person.name} was removed from the event.`);
    } catch (requestError) {
      setPeopleResponse(currentResponse);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not remove this member.",
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

      <section className="surface-card space-y-5 p-6">
        <div className="overflow-x-auto rounded-lg border border-ink/10 bg-ivory/60 p-1">
          <div className="flex min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`inline-flex items-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? "bg-ink text-ivory shadow-sm"
                    : "text-slate hover:bg-white"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    activeTab === tab.id ? "bg-white/15 text-ivory" : "bg-white text-slate"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {activeTab === "users" ? (
          <div className="space-y-3">
            {members.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                canManageRoles={canManageRoles}
                canRemoveMembers={canRemoveMembers}
                onRoleToggle={handleRoleToggle}
                onRemoveMember={handleRemoveMember}
              />
            ))}
            {!members.length ? (
              <p className="rounded-lg bg-ivory/70 p-4 text-sm text-slate">
                No signed-in users have joined this event yet.
              </p>
            ) : null}
          </div>
        ) : null}

        {activeTab === "anonymous" ? (
          anonymousUploaders.length ? (
            <div className="space-y-3">
              {anonymousUploaders.map((person) => (
                <PersonRow key={person.id} person={person} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-ivory/70 p-4 text-sm text-slate">
              No anonymous uploads have been submitted.
            </p>
          )
        ) : null}

        {success ? <p className="text-sm text-seafoam-700">{success}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </section>
    </div>
  );
}

function PersonRow({
  person,
  canManageRoles = false,
  canRemoveMembers = false,
  onRoleToggle,
  onRemoveMember,
}: {
  person: EventPerson;
  canManageRoles?: boolean;
  canRemoveMembers?: boolean;
  onRoleToggle?: (person: EventPerson) => void;
  onRemoveMember?: (person: EventPerson) => void;
}) {
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
            {getPersonSubtext(person)}
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
        {canManageRoles && !isCreator && !isAnonymous && onRoleToggle ? (
          <button
            type="button"
            className="secondary-button min-h-0 px-3 py-1 text-xs"
            onClick={() => onRoleToggle(person)}
          >
            {isAdmin ? "Remove admin" : "Make admin"}
          </button>
        ) : null}
        {canRemoveMembers && !isCreator && !isAnonymous && onRemoveMember ? (
          <button
            type="button"
            className="secondary-button min-h-0 border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
            onClick={() => onRemoveMember(person)}
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

function getPersonSubtext(person: EventPerson) {
  if (person.kind === "anonymous") {
    return "Anonymous uploader";
  }

  return person.email || "Email hidden";
}
