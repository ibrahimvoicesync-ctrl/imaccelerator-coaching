import { requireRole } from "@/lib/session";
import { ImaAi } from "@/components/ai/ImaAi";

// Hidden owner-only preview of the embedded IMA AI — not linked from nav.
// Promote to the real AI tab once verified.
export default async function OwnerAiPreviewPage() {
  await requireRole("owner");
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 h-[calc(100dvh-4rem)] md:h-dvh">
      <ImaAi />
    </div>
  );
}
