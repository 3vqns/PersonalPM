import {
  ArrowRight,
  CalendarDays,
  Heart,
  Images,
  MapPin,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";
import { formatDate, getInitials } from "../lib/date";
import type { EventSummary } from "../types";

interface EventCardProps {
  event: EventSummary;
  variant: "created" | "joined";
  category: string;
  isFavorite: boolean;
  onToggleFavorite: (eventId: string) => void;
}

const avatarShells = [
  "bg-[#F7E6D8] text-[#8B5E3D]",
  "bg-[#EEE4DA] text-[#6B5140]",
  "bg-[#F5EEDB] text-[#947341]",
];

export function EventCard({
  event,
  variant,
  category,
  isFavorite,
  onToggleFavorite,
}: EventCardProps) {
  const newPhotoCount = getNewPhotoCount(event);
  const attendeePreviews = getAttendeePreviews(event);
  const venueLabel = getVenueLabel(category);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-[#eadfd1] bg-white/90 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(94,67,47,0.14)]">
      <div className="relative h-56 overflow-hidden bg-soft-radial">
        {event.coverUrl ? (
          <img
            src={event.coverUrl}
            alt={event.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#faf0e8] via-[#fff8f0] to-[#f1e4d7] text-ink">
            <Sparkles className="h-10 w-10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#3e2c21]/65 via-[#3e2c21]/5 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink shadow-sm">
              {category}
            </span>
            <span className="rounded-full bg-[#4b3528]/80 px-3 py-1 text-xs font-medium text-[#fff8f0]">
              {variant === "created" ? "Hosting" : "Registered"}
            </span>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/88 text-ink shadow-sm transition hover:bg-white"
            onClick={() => onToggleFavorite(event.id)}
            aria-label={
              isFavorite ? "Remove from favorites" : "Add to favorites"
            }
          >
            <Heart
              className={cn(
                "h-5 w-5 transition",
                isFavorite && "fill-seafoam-500 text-seafoam-500",
              )}
            />
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate/80">
            {variant === "created"
              ? "You’re hosting this gallery"
              : `Hosted by ${event.hostName ?? "PictureMe host"}`}
          </p>
          <h3 className="text-[1.65rem] leading-tight text-ink">{event.name}</h3>
        </div>

        <div className="space-y-3 text-sm text-slate">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-seafoam-500" />
            <span>{formatDate(event.date)}</span>
          </div>
          <div className="flex items-center gap-3">
            <MapPin className="h-4 w-4 text-seafoam-500" />
            <span>{venueLabel}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center">
            <div className="flex items-center">
              {attendeePreviews.map((member, index) => (
                <div
                  key={`${event.id}-${member.id}-${index}`}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white text-xs font-semibold shadow-sm",
                    index > 0 && "-ml-3",
                    avatarShells[index % avatarShells.length],
                  )}
                  title={member.name}
                >
                  {member.avatarUrl ? (
                    <img
                      src={member.avatarUrl}
                      alt={member.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getInitials(member.name)
                  )}
                </div>
              ))}
            </div>
            <div className="ml-4 inline-flex items-center gap-2 rounded-full bg-[#f7efe6] px-3 py-2 text-sm font-medium text-[#6e5745]">
              <Images className="h-4 w-4 text-seafoam-500" />
              <span>{event.photoCount} photos</span>
            </div>
          </div>
          {event.daysRemaining > 0 && event.daysRemaining < 14 ? (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-500">
              {event.daysRemaining}d left
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center justify-between gap-4 border-t border-[#f0e3d6] pt-4">
          <Link className="primary-button px-4 py-3 text-sm" to={`/event/${event.id}`}>
            View Photos
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <p className="text-sm text-slate">
            <span className="font-semibold text-seafoam-500">{newPhotoCount}</span>{" "}
            {newPhotoCount === 1 ? "new photo" : "new photos"}
          </p>
        </div>
      </div>
    </article>
  );
}

function getNewPhotoCount(event: EventSummary) {
  if (typeof event.myPhotosCount === "number") {
    return event.myPhotosCount;
  }

  if (!event.photoCount) {
    return 0;
  }

  return Math.min(8, Math.max(1, Math.round(event.photoCount / 18)));
}

function getAttendeePreviews(event: EventSummary) {
  const memberPreviews = Array.isArray(event.memberPreviews)
    ? event.memberPreviews
    : [];

  if (memberPreviews.length > 0) {
    return memberPreviews.slice(0, 3);
  }

  return [
    {
      id: `${event.id}-host`,
      name: event.hostName ?? "PictureMe host",
    },
  ];
}

function getVenueLabel(category: string) {
  if (category === "Weddings") {
    return "Private venue details";
  }

  if (category === "Conferences") {
    return "Convention venue";
  }

  if (category === "Parties") {
    return "Private celebration venue";
  }

  if (category === "Sports") {
    return "Main event arena";
  }

  if (category === "Networking") {
    return "Members club lounge";
  }

  return "Venue details coming soon";
}
