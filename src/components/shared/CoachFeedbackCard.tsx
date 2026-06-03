import { Card, CardContent } from "@/components/ui/Card";
import { MessageSquare } from "lucide-react";

type CoachFeedbackCardProps = {
  comment: string;
  coachName: string;
  updatedAt: string;
};

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatCommentDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CoachFeedbackCard({ comment, coachName, updatedAt }: CoachFeedbackCardProps) {
  return (
    <Card variant="accent" role="region" aria-label="Coach feedback">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-ima-primary flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-white">{getInitials(coachName)}</span>
          </div>
          <span className="text-sm font-medium text-ima-text">{coachName}</span>
          <MessageSquare className="h-4 w-4 text-ima-text-muted ml-auto" aria-hidden="true" />
        </div>
        <p className="text-xs text-ima-text-secondary mt-1">{formatCommentDate(updatedAt)}</p>
        <p className="text-sm text-ima-text mt-2 whitespace-pre-wrap">{comment}</p>
      </CardContent>
    </Card>
  );
}
