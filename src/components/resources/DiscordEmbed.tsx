"use client";

import { MessageSquare } from "lucide-react";

export function DiscordEmbed() {
  const guildId = process.env.NEXT_PUBLIC_DISCORD_GUILD_ID;
  const channelId = process.env.NEXT_PUBLIC_DISCORD_CHANNEL_ID;

  if (!guildId || !channelId) {
    return (
      <div className="flex flex-col items-center gap-4 text-center max-w-md mx-auto py-8 md:py-10">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full bg-ima-surface-accent text-ima-primary"
          aria-hidden="true"
        >
          <MessageSquare className="h-6 w-6" strokeWidth={2.25} />
        </span>
        <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary">
          Not configured
        </p>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-ima-text leading-tight">
          Community channel pending
        </h2>
        <p className="text-sm text-ima-text-secondary leading-relaxed">
          The Discord embed will appear here once your admin configures the server connection.
        </p>
      </div>
    );
  }

  return (
    <iframe
      src={`https://e.widgetbot.io/channels/${guildId}/${channelId}`}
      title="Discord Community"
      height="600"
      width="100%"
      className="block rounded-xl"
      aria-label="Discord community chat"
    />
  );
}
