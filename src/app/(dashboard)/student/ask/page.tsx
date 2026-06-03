import { Bot, MessageSquare } from "lucide-react";
import { AskIframe } from "@/components/student/AskIframe";
import { requireRole } from "@/lib/session";
import { AI_CONFIG } from "@/lib/config";

export default async function AskAbuLahyaPage() {
  await requireRole("student");

  const iframeReady = Boolean(AI_CONFIG.iframeUrl);

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        <header className="motion-safe:animate-fadeIn">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p
                className="text-[11px] font-semibold tracking-[0.22em] text-ima-text-secondary uppercase"
              >
                Ask
              </p>
              <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
                {AI_CONFIG.title}
              </h1>
              <p className="mt-2 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
                {AI_CONFIG.subtitle}
              </p>
            </div>
            {iframeReady && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-full bg-ima-warning/10 border border-ima-warning/10 text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-warning shrink-0">
                <MessageSquare className="h-3 w-3" aria-hidden="true" />
                24/7 Available
              </span>
            )}
          </div>
        </header>

        {iframeReady ? (
          <section
            aria-label="Assistant chat"
            className="mt-9 bg-white border border-ima-border rounded-[14px] overflow-hidden motion-safe:animate-fadeIn"
            style={{ animationDelay: "100ms" }}
          >
            <AskIframe />
          </section>
        ) : (
          <section
            aria-label="Assistant unavailable"
            className="mt-9 bg-white border border-ima-border rounded-[14px] p-10 text-center motion-safe:animate-fadeIn"
            style={{ animationDelay: "100ms" }}
          >
            <div className="mx-auto w-12 h-12 rounded-[12px] bg-ima-surface-light border border-ima-border flex items-center justify-center">
              <Bot className="h-6 w-6 text-ima-text-secondary" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-[22px] md:text-[24px] font-semibold text-ima-text tracking-[-0.01em] leading-tight">
              Coming soon
            </h2>
            <p className="mt-2 text-[14px] text-ima-text-secondary leading-relaxed max-w-md mx-auto">
              The AI assistant will be available soon.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
