import { motion } from "framer-motion";
import { ArrowRight, Image as ImageIcon, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";

export function LandingHero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20">
      <div className="absolute inset-0 bg-gradient-to-b from-coffee-100/50 via-background to-background" />
      <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-accent/5 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center lg:text-left"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                AI-Powered Photo Matching
              </span>
            </motion.div>

            <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Your Photos <span className="text-primary">Find You</span>
            </h1>

            <p className="text-pretty mx-auto mt-6 max-w-xl text-lg text-muted-foreground lg:mx-0 lg:text-xl">
              Stop scrolling through thousands of event photos. Scan your face
              once, and let AI automatically find every photo you appear in.
            </p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-10 flex flex-col justify-center gap-4 sm:flex-row lg:justify-start"
            >
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-lg transition-all hover:scale-[1.02] hover:bg-primary/90 hover:shadow-xl"
              >
                Create Free Account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-6 py-3.5 text-base font-semibold text-foreground transition-all hover:bg-secondary"
              >
                See How It Works
              </a>
            </motion.div>


          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative"
          >
            <div className="relative grid grid-cols-2 gap-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="col-span-2 aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-coffee-200 to-coffee-300 shadow-2xl"
              >
                <img src="/Pic1.WebP" alt="Event preview" className="h-full w-full object-cover" />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.7 }}
                className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-coffee-100 to-coffee-200 shadow-lg"
              >
                <img src="/Pic2.WebP" alt="Users enjoying event" className="h-full w-full object-cover" />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 shadow-lg"
              >
                <img src="/Pic3.WebP" alt="Event highlights" className="h-full w-full object-cover" />
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 20, y: 20 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.8, delay: 1 }}
              className="absolute -bottom-6 -left-6 max-w-[200px] rounded-xl border border-border bg-background p-4 shadow-xl"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                  <svg
                    className="h-5 w-5 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    12 Photos Found
                  </p>
                  <p className="text-xs text-muted-foreground">Just now</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="flex h-10 w-6 items-start justify-center rounded-full border-2 border-muted-foreground/30 p-2"
        >
          <div className="h-2.5 w-1.5 rounded-full bg-muted-foreground/50" />
        </motion.div>
      </motion.div>
    </section>
  );
}
