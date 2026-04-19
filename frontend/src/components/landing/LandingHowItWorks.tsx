import { motion } from "framer-motion";
import { QrCode, Sparkles, Upload, UserPlus } from "lucide-react";
import { useScrollAnimation } from "./useScrollAnimation";

const steps = [
  {
    number: "01",
    icon: UserPlus,
    title: "Create Your Account",
    description:
      "Sign up with email or Google. Optionally complete a quick face scan to enable automatic photo matching at all events.",
    color: "from-coffee-400 to-coffee-500",
  },
  {
    number: "02",
    icon: QrCode,
    title: "Join an Event",
    description:
      "Scan the event QR code or open the join link. You'll instantly become a member and gain access to the event gallery.",
    color: "from-coffee-500 to-coffee-600",
  },
  {
    number: "03",
    icon: Upload,
    title: "Photos Get Uploaded",
    description:
      "Event organizers and photographers upload photos. Each photo is automatically indexed and searched for faces.",
    color: "from-coffee-600 to-coffee-700",
  },
  {
    number: "04",
    icon: Sparkles,
    title: "Your Photos Find You",
    description:
      "Check 'My Photos' to see every photo you appear in. Download the ones you want in a single tap.",
    color: "from-primary to-accent",
  },
];

export function LandingHowItWorks() {
  const { ref, isInView } = useScrollAnimation();

  return (
    <section
      id="how-it-works"
      className="overflow-hidden bg-coffee-800 py-24 text-cream lg:py-32"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mx-auto mb-16 max-w-3xl text-center lg:mb-24"
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-coffee-300">
            How It Works
          </span>
          <h2 className="text-balance mt-4 text-3xl font-bold tracking-tight text-cream lg:text-5xl">
            Four Simple Steps to Your Photos
          </h2>
          <p className="text-pretty mt-6 text-lg text-coffee-200">
            No more scrolling through thousands of photos. Set up once and let
            PictureMe do the work for you.
          </p>
        </motion.div>

        <div className="relative">
          <div className="absolute left-0 right-0 top-1/2 hidden h-0.5 -translate-y-1/2 bg-gradient-to-r from-coffee-700 via-coffee-600 to-coffee-700 lg:block" />

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {steps.map((step, index) => (
              <StepCard key={step.number} step={step} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({
  step,
  index,
}: {
  step: (typeof steps)[0];
  index: number;
}) {
  const { ref, isInView } = useScrollAnimation();
  const Icon = step.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.15 }}
      className="relative flex flex-col items-center text-center"
    >
      <div className="relative z-10">
        <div
          className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${step.color} shadow-lg shadow-black/20`}
        >
          <Icon className="h-9 w-9 text-cream" />
        </div>
        <div className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-cream text-sm font-bold text-coffee-800 shadow-md">
          {step.number}
        </div>
      </div>

      <h3 className="mt-8 text-xl font-semibold text-cream">{step.title}</h3>
      <p className="mt-4 max-w-xs leading-relaxed text-coffee-200">
        {step.description}
      </p>
    </motion.div>
  );
}
