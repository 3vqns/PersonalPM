import {
  AlertCircle,
  CalendarPlus,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { EventCard } from "../components/EventCard";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { Spinner } from "../components/Spinner";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/cn";
import {
  getFavoriteEventIds,
  getFaceBannerDismissed,
  setFavoriteEventIds,
  setFaceBannerDismissed,
} from "../lib/storage";
import type { DashboardResponse, EventSummary } from "../types";

type DashboardTab = "upcoming" | "past" | "favorites";
type DashboardFilter =
  | "All"
  | "Conferences"
  | "Weddings"
  | "Parties"
  | "Sports"
  | "Networking";

const dashboardTabs: Array<{ id: DashboardTab; label: string }> = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past Events" },
  { id: "favorites", label: "Favorites" },
];

const dashboardFilters: DashboardFilter[] = [
  "All",
  "Conferences",
  "Weddings",
  "Parties",
  "Sports",
  "Networking",
];

export function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(getFaceBannerDismissed);
  const [activeTab, setActiveTab] = useState<DashboardTab>("upcoming");
  const [activeFilter, setActiveFilter] = useState<DashboardFilter>("All");
  const [searchValue, setSearchValue] = useState("");
  const [favoriteIds, setFavoriteIdsState] =
    useState<string[]>(getFavoriteEventIds);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        const response = await apiFetch<DashboardResponse>("/api/dashboard");
        setData(response);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "PictureMe could not load your dashboard.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="page-shell flex min-h-[60vh] items-center justify-center">
        <Spinner label="Loading your events..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-shell max-w-2xl">
        <div className="surface-card flex items-start gap-3 p-6 text-red-700">
          <AlertCircle className="mt-1 h-5 w-5" />
          <div>
            <h1 className="text-2xl text-ink">Dashboard unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-slate">
              {error ?? "PictureMe could not load your dashboard."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const showFaceBanner = !data.user.hasFaceProfile && !bannerDismissed;
  const dashboardEvents = [
    ...data.createdEvents.map((event) => ({
      event,
      variant: "created" as const,
      category: (event.category as DashboardFilter) || inferEventCategory(event),
    })),
    ...data.joinedEvents.map((event) => ({
      event,
      variant: "joined" as const,
      category: (event.category as DashboardFilter) || inferEventCategory(event),
    })),
  ];
  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredEvents = dashboardEvents
    .filter(({ event, category }) => {
      if (activeFilter !== "All" && category !== activeFilter) {
        return false;
      }

      if (!matchesTab(event, activeTab, favoriteIds)) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [event.name, event.hostName, category]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalizedSearch));
    })
    .sort((left, right) => sortEventsForTab(left.event, right.event, activeTab));
  const upcomingCount = dashboardEvents.filter(({ event }) =>
    matchesTab(event, "upcoming", favoriteIds),
  ).length;
  const favoriteCount = dashboardEvents.filter(({ event }) =>
    favoriteIds.includes(event.id),
  ).length;
  const activeTabLabel =
    dashboardTabs.find((tab) => tab.id === activeTab)?.label ?? "Upcoming";
  const emptyStateCta = getEmptyStateCta({
    activeTab,
    activeFilter,
    normalizedSearch,
    dashboardEventsCount: dashboardEvents.length,
    onCreate: () => setCreateOpen(true),
    onReset: () => {
      setActiveTab("upcoming");
      setActiveFilter("All");
      setSearchValue("");
    },
    onShowPast: () => setActiveTab("past"),
    onShowUpcoming: () => setActiveTab("upcoming"),
  });

  return (
    <div className="page-shell space-y-8">
      {createOpen ? (
        <CreateEventModal
          onClose={() => setCreateOpen(false)}
          onCreated={(eventId) => navigate(`/event/${eventId}?created=1`)}
        />
      ) : null}

      <section className="relative overflow-hidden rounded-[32px] border border-[#e8dccf] bg-white/55 px-5 py-6 shadow-card backdrop-blur-xl sm:px-8 sm:py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(236,212,187,0.3),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(199,113,61,0.08),transparent_30%)]" />
        <div className="relative space-y-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div>
                <h1 className="text-4xl text-ink sm:text-5xl">Welcome Back!</h1>
                <p className="mt-2 text-base text-slate sm:text-lg">
                  Your Registered Events
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-slate">
                <span className="rounded-full bg-white/75 px-4 py-2 shadow-sm">
                  {upcomingCount} upcoming galleries
                </span>
                <span className="rounded-full bg-white/75 px-4 py-2 shadow-sm">
                  {favoriteCount} favorites saved
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <label className="relative block flex-1">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate/65" />
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search events, hosts, or moments"
                className="w-full rounded-full border border-[#e6dacd] bg-[#fff9f3] py-4 pl-14 pr-14 text-base text-ink shadow-sm outline-none transition placeholder:text-slate/55 focus:border-seafoam-300 focus:ring-2 focus:ring-seafoam-100"
              />
              <Search className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-seafoam-500" />
            </label>

            <div className="flex items-end gap-5 overflow-x-auto">
              {dashboardTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={cn(
                    "border-b-2 pb-3 text-sm font-medium whitespace-nowrap transition",
                    activeTab === tab.id
                      ? "border-seafoam-500 text-ink"
                      : "border-transparent text-slate/80 hover:text-ink",
                  )}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex gap-3 overflow-x-auto pb-1">
              {dashboardFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={cn(
                    "tab-pill whitespace-nowrap border",
                    activeFilter === filter
                      ? "border-[#4b3528] bg-ink text-[#fff8f0]"
                      : "border-[#e3d6c8] bg-[#fff9f2]/75 text-ink hover:bg-white",
                  )}
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter}
                </button>
              ))}
              <button
                type="button"
                className="tab-pill inline-flex items-center gap-2 whitespace-nowrap border border-[#e3d6c8] bg-[#fff9f2]/75 text-ink hover:bg-white"
                onClick={() => {
                  setActiveTab("upcoming");
                  setActiveFilter("All");
                  setSearchValue("");
                }}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </button>
            </div>

            <button
              type="button"
              className="primary-button self-start whitespace-nowrap"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create event
            </button>
          </div>
        </div>
      </section>

      {showFaceBanner ? (
        <div className="surface-card flex flex-col gap-3 border-[#f0dfc9] bg-[#fff6ee]/85 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">
              Complete your face profile to see your photos automatically.
            </p>
            <p className="mt-1 text-sm text-slate">
              You can still browse galleries now, but matching stays off until you
              add a face scan.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setFaceBannerDismissed(true);
                setBannerDismissed(true);
              }}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => navigate("/account/settings")}
            >
              Go to settings
            </button>
          </div>
        </div>
      ) : null}

      <section className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-seafoam-500">
              {activeTabLabel}
            </p>
            <h2 className="text-3xl text-ink">Curated event galleries</h2>
          </div>
          <p className="text-sm text-slate">
            {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}{" "}
            ready to browse
          </p>
        </div>

        {filteredEvents.length ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map(({ event, variant, category }) => (
              <EventCard
                key={event.id}
                event={event}
                variant={variant}
                category={category}
                isFavorite={favoriteIds.includes(event.id)}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={
              activeTab === "favorites" ? (
                <Sparkles className="h-7 w-7" />
              ) : (
                <CalendarPlus className="h-7 w-7" />
              )
            }
            title={getEmptyStateTitle({
              activeTab,
              normalizedSearch,
              activeFilter,
              dashboardEventsCount: dashboardEvents.length,
            })}
            description={getEmptyStateDescription({
              activeTab,
              normalizedSearch,
              activeFilter,
              dashboardEventsCount: dashboardEvents.length,
            })}
            cta={emptyStateCta}
          />
        )}
      </section>
    </div>
  );

  function handleToggleFavorite(eventId: string) {
    setFavoriteIdsState((current) => {
      const next = current.includes(eventId)
        ? current.filter((value) => value !== eventId)
        : [...current, eventId];
      setFavoriteEventIds(next);
      return next;
    });
  }
}

function CreateEventModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (eventId: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    date: "",
    category: "Conferences",
    description: "",
    cover: null as File | null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append("name", form.name);
    formData.append("date", form.date);
    formData.append("category", form.category);
    if (form.description) {
      formData.append("description", form.description);
    }
    if (form.cover) {
      formData.append("cover", form.cover);
    }

    try {
      const response = await apiFetch<{ id: string }>("/api/events", {
        method: "POST",
        body: formData,
      });
      onCreated(response.id);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PictureMe could not create the event.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Create event" onClose={onClose} className="sm:max-w-xl">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">Event name</span>
          <div className="field-shell">
            <input
              className="field-input"
              value={form.name}
              onChange={(event) =>
                setForm((value) => ({ ...value, name: event.target.value }))
              }
              placeholder="Saturday night reception"
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
              onChange={(event) =>
                setForm((value) => ({ ...value, date: event.target.value }))
              }
              required
            />
          </div>
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">Category</span>
          <div className="field-shell">
            <select
              className="field-input appearance-none bg-transparent"
              value={form.category}
              onChange={(event) =>
                setForm((value) => ({ ...value, category: event.target.value }))
              }
              required
            >
              <option value="Conferences">Conferences</option>
              <option value="Weddings">Weddings</option>
              <option value="Parties">Parties</option>
              <option value="Sports">Sports</option>
              <option value="Networking">Networking</option>
            </select>
          </div>
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">Description</span>
          <div className="field-shell">
            <textarea
              className="field-input min-h-24 resize-none"
              value={form.description}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  description: event.target.value,
                }))
              }
              placeholder="Optional details about the event"
            />
          </div>
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">Cover photo</span>
          <div className="field-shell">
            <input
              className="field-input"
              type="file"
              accept="image/*"
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  cover: event.target.files?.[0] ?? null,
                }))
              }
            />
          </div>
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" className="secondary-button flex-1" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button flex-1" disabled={submitting}>
            {submitting ? "Creating..." : "Create event"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function inferEventCategory(event: EventSummary): DashboardFilter {
  const haystack = `${event.name} ${event.hostName ?? ""}`.toLowerCase();

  if (/(wedding|reception|bridal|ceremony)/.test(haystack)) {
    return "Weddings";
  }

  if (/(hack|conference|summit|expo|launch|demo|keynote)/.test(haystack)) {
    return "Conferences";
  }

  if (/(party|gala|birthday|rooftop|celebration)/.test(haystack)) {
    return "Parties";
  }

  if (/(sport|game|match|tournament|race|run)/.test(haystack)) {
    return "Sports";
  }

  if (/(network|meetup|mixer|social)/.test(haystack)) {
    return "Networking";
  }

  return "Conferences";
}

function matchesTab(
  event: EventSummary,
  activeTab: DashboardTab,
  favoriteIds: string[],
) {
  if (activeTab === "favorites") {
    return favoriteIds.includes(event.id);
  }

  const eventDate = new Date(`${event.date}T23:59:59`);
  const now = new Date();
  const isPastEvent = eventDate.getTime() < now.getTime();

  return activeTab === "past" ? isPastEvent : !isPastEvent;
}

function sortEventsForTab(
  left: EventSummary,
  right: EventSummary,
  activeTab: DashboardTab,
) {
  const leftDate = new Date(left.date).getTime();
  const rightDate = new Date(right.date).getTime();

  if (activeTab === "past") {
    return rightDate - leftDate;
  }

  return leftDate - rightDate;
}

function getEmptyStateTitle({
  activeTab,
  normalizedSearch,
  activeFilter,
  dashboardEventsCount,
}: {
  activeTab: DashboardTab;
  normalizedSearch: string;
  activeFilter: DashboardFilter;
  dashboardEventsCount: number;
}) {
  if (activeTab === "favorites") {
    return "No favorites saved yet";
  }

  if (normalizedSearch || activeFilter !== "All") {
    return "No events match your search";
  }

  if (!dashboardEventsCount) {
    return "Create your first event";
  }

  return activeTab === "past" ? "No past events yet" : "No upcoming events right now";
}

function getEmptyStateDescription({
  activeTab,
  normalizedSearch,
  activeFilter,
  dashboardEventsCount,
}: {
  activeTab: DashboardTab;
  normalizedSearch: string;
  activeFilter: DashboardFilter;
  dashboardEventsCount: number;
}) {
  if (activeTab === "favorites") {
    return "Tap the heart on any event card to keep your most important galleries close.";
  }

  if (normalizedSearch || activeFilter !== "All") {
    return "Try another keyword, switch tabs, or clear the filters to widen the gallery view.";
  }

  if (!dashboardEventsCount) {
    return "Event hosts can create a gallery, upload a cover image, and share a QR code with guests.";
  }

  return activeTab === "past"
    ? "Your completed galleries will settle here once the event date has passed."
    : "Create a new event or open the Past Events tab to revisit older galleries.";
}

function getEmptyStateCta({
  activeTab,
  activeFilter,
  normalizedSearch,
  dashboardEventsCount,
  onCreate,
  onReset,
  onShowPast,
  onShowUpcoming,
}: {
  activeTab: DashboardTab;
  activeFilter: DashboardFilter;
  normalizedSearch: string;
  dashboardEventsCount: number;
  onCreate: () => void;
  onReset: () => void;
  onShowPast: () => void;
  onShowUpcoming: () => void;
}) {
  if (activeTab === "favorites" || normalizedSearch || activeFilter !== "All") {
    return {
      label: "Reset filters",
      onClick: onReset,
    };
  }

  if (!dashboardEventsCount) {
    return {
      label: "Create event",
      onClick: onCreate,
    };
  }

  if (activeTab === "past") {
    return {
      label: "View upcoming",
      onClick: onShowUpcoming,
    };
  }

  return {
    label: "View past events",
    onClick: onShowPast,
  };
}
