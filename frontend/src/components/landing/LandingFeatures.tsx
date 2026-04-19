import { motion } from "framer-motion";
import { Clock, Download, Image, QrCode, Scan, Shield } from "lucide-react";
import { useScrollAnimation } from "./useScrollAnimation";

const features = [
  {
    icon: Scan,
    title: "AI Face Matching",
    description:
      "Scan your face once during signup. Our AI remembers you forever and finds your photos at every event automatically.",
  },
  {
    icon: QrCode,
    title: "QR Code Join",
    description:
      "Event organizers generate a QR code. Attendees scan it, join instantly, and start seeing their matched photos.",
  },
  {
    icon: Image,
    title: "Smart Galleries",
    description:
      "Two views in one: 'My Photos' shows your matched photos, 'All Photos' lets you browse everything.",
  },
  {
    icon: Download,
    title: "Easy Photo Downloads",
    description:
      "Download individual photos in one tap and share your gallery link with family in one click.",
  },
  {
    icon: Shield,
    title: "Privacy First",
    description:
      "Face scan is optional. Galleries are private to signed-in members only. Your data stays secure.",
  },
  {
    icon: Clock,
    title: "Real-time Updates",
    description:
      "As photographers upload new photos, your gallery updates live. Never miss a shot of yourself.",
  },
];

export function LandingFeatures() {
  const { ref, isInView } = useScrollAnimation();

  return (
    <section
      id="features"
      className="bg-gradient-to-b from-background to-coffee-50/50 py-24 lg:py-32"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mx-auto mb-16 max-w-3xl text-center lg:mb-20"
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">
            Features
          </span>
          <h2 className="text-balance mt-4 text-3xl font-bold tracking-tight text-foreground lg:text-5xl">
            Everything You Need for Event Photos
          </h2>
          <p className="text-pretty mt-6 text-lg text-muted-foreground">
            From AI-powered face matching to instant QR code joining, PictureMe
            makes finding your event photos effortless.
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[0];
  index: number;
}) {
  const { ref, isInView } = useScrollAnimation();
  const Icon = feature.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="group relative rounded-2xl border border-border bg-background p-8 transition-all duration-300 hover:border-primary/30 hover:shadow-xl"
    >
      <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="h-7 w-7" />
      </div>

      <h3 className="mb-3 text-xl font-semibold text-foreground">
        {feature.title}
      </h3>
      <p className="leading-relaxed text-muted-foreground">
        {feature.description}
      </p>

      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </motion.div>
  );
}
