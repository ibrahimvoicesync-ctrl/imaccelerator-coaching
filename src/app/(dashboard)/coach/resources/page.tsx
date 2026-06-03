import { requireRole } from "@/lib/session";
import { ResourcesClient } from "@/components/resources/ResourcesClient";

export default async function CoachResourcesPage() {
  await requireRole("coach");
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        <header className="motion-safe:animate-fadeIn">
          <p className="text-xs font-semibold tracking-[0.2em] text-ima-text-secondary uppercase">
            Resources
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold leading-tight text-ima-text tracking-tight">
            Curate the shared library
          </h1>
          <p className="mt-2 text-sm text-ima-text-secondary leading-relaxed">
            Links, community, and glossary your students rely on.
          </p>
        </header>

        <div
          className="mt-9 bg-white border border-ima-border rounded-[14px] p-6 md:p-8 motion-safe:animate-fadeIn"
          style={{ animationDelay: "50ms" }}
        >
          <ResourcesClient role="coach" coachEditorial />
        </div>
      </div>
    </div>
  );
}
