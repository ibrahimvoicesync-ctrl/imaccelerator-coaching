import type { Metadata } from "next";
import { ImaAi } from "@/components/ai/ImaAi";

export const metadata: Metadata = {
  title: "IMA AI preview",
  robots: { index: false, follow: false },
};

// Public, unlisted preview of the embedded IMA AI — no sign-in required (the
// proxy lets /ai-preview through). Signed-in visitors still hand their session
// token to the AI; anonymous visitors send `null`. Not linked from anywhere.
export default function PublicAiPreviewPage() {
  return (
    <main className="h-dvh w-full bg-ima-bg">
      <ImaAi />
    </main>
  );
}
