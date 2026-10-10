import Link from "next/link";
import { Bot, ClipboardCheck, MessageSquare } from "lucide-react";
import { AskIframe } from "@/components/student/AskIframe";
import { BusinessCheckinForm } from "@/components/student/BusinessCheckinForm";
import { requireRole } from "@/lib/session";
import { getCheckinStatus } from "@/lib/business-checkin";
import { AI_CONFIG, BUSINESS_CHECKIN } from "@/lib/config";
import { cn } from "@/lib/utils";

export default async function AskAbuLahyaPage({
  searchParams,
}: {
  searchParams: Promise<{ update?: string }>;
}) {
  const user = await requireRole("student");
  const [{ update }, checkin] = await Promise.all([searchParams, getCheckinStatus(user.id)]);

  const iframeReady = Boolean(AI_CONFIG.iframeUrl);
  const showForm = !checkin.unlocked || update === "1";
  const dueSoon = checkin.unlocked && checkin.daysLeft <= BUSINESS_CHECKIN.dueSoonDays;

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[880px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
        <header className="motion-safe:animate-fadeIn">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p
                className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
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

        {showForm ? (
          <div className="mt-9 motion-safe:animate-fadeIn" style={{ animationDelay: "100ms" }}>
            <BusinessCheckinForm
              previous={checkin.latest}
              mode={checkin.unlocked ? "update" : checkin.latest ? "lapsed" : "first"}
              cancelHref={checkin.unlocked ? "/student/ask" : undefined}
            />
          </div>
        ) : (
          <>
            <div
              className="mt-9 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-ima-border bg-white shadow-card px-6 py-[14px] motion-safe:animate-fadeIn"
              style={{ animationDelay: "60ms" }}
            >
              <p className="inline-flex items-center gap-2 text-[13px] text-ima-text-secondary">
                <ClipboardCheck
                  className={cn("h-4 w-4", dueSoon ? "text-ima-warning" : "text-ima-success")}
                  aria-hidden="true"
                />
                <span>
                  Business check-in{" "}
                  <span className={cn("font-semibold", dueSoon ? "text-ima-warning" : "text-ima-text")}>
                    {checkin.daysLeft === 1 ? "due tomorrow" : `due in ${checkin.daysLeft} days`}
                  </span>
                  {dueSoon && " — refresh it to keep the AI unlocked"}
                </span>
              </p>
              <Link
                href="/student/ask?update=1"
                className="inline-flex items-center min-h-[44px] text-[13px] font-semibold text-ima-primary rounded-md focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
              >
                Update now
              </Link>
            </div>

          {iframeReady ? (
            <section
              aria-label="Assistant chat"
              className="mt-[14px] bg-white border border-ima-border rounded-[14px] shadow-card overflow-hidden motion-safe:animate-fadeIn"
              style={{ animationDelay: "100ms" }}
            >
              <AskIframe />
            </section>
          ) : (
            <section
              aria-label="Assistant unavailable"
              className="mt-[14px] bg-white border border-ima-border rounded-[14px] shadow-card p-10 text-center motion-safe:animate-fadeIn"
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
          </>
        )}
      </div>
    </div>
  );
}
