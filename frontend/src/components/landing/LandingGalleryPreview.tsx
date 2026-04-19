import { motion } from "framer-motion";
import { Image as ImageIcon, Share2, User } from "lucide-react";
import { useState } from "react";
import { useScrollAnimation } from "./useScrollAnimation";

const mockPhotos = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  matched: index < 5,
}));

export function LandingGalleryPreview() {
  const { ref, isInView } = useScrollAnimation();
  const [activeTab, setActiveTab] = useState<"my" | "all">("my");

  const filteredPhotos =
    activeTab === "my" ? mockPhotos.filter((photo) => photo.matched) : mockPhotos;

  return (
    <section
      id="gallery"
      className="bg-gradient-to-b from-coffee-50/50 to-background py-24 lg:py-32"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mx-auto mb-12 max-w-3xl text-center"
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">
            Gallery Experience
          </span>
          <h2 className="text-balance mt-4 text-3xl font-bold tracking-tight text-foreground lg:text-5xl">
            See How Your Gallery Looks
          </h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Switch between your matched photos and the full event gallery
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mx-auto max-w-5xl"
        >
          <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
            <div className="border-b border-border p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    Sarah&apos;s Wedding Reception
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    March 15, 2024 - 247 photos
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </button>
                </div>
              </div>

              <div className="mt-6 flex w-fit gap-1 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("my")}
                  className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    activeTab === "my"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <User className="h-4 w-4" />
                  My Photos
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    5
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
                    activeTab === "all"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ImageIcon className="h-4 w-4" />
                  All Photos
                  <span className="rounded-full bg-muted-foreground/20 px-2 py-0.5 text-xs text-muted-foreground">
                    247
                  </span>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {filteredPhotos.map((photo, index) => (
                  <motion.div
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className="group aspect-square cursor-pointer overflow-hidden rounded-xl bg-gradient-to-br from-coffee-100 to-coffee-200 transition-all hover:ring-2 hover:ring-primary hover:ring-offset-2"
                  >
                    <div className="relative flex h-full w-full items-center justify-center">
                      <img
                        src={`/Pic${(photo.id % 10) + 1}.WebP`}
                        alt="Gallery sample"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      {photo.matched ? (
                        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                          <User className="h-3 w-3 text-primary-foreground" />
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
