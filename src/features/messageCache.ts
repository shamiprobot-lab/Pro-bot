import { Telegraf } from "telegraf";

// Remembers the text/caption a message had when it was first sent, so that
// when it's later edited we can tell whether a link was *newly added* vs.
// already present in the original (e.g. a normal @username or link that
// already passed moderation). Entries are pruned automatically — nothing
// is persisted to disk.
const TTL_MS = 60 * 60 * 1000; // 1 hour is plenty for catching "edit in a link" spam
const cache = new Map<string, { text: string; ts: number }>();

function key(chatId: number, messageId: number): string {
  return `${chatId}:${messageId}`;
}

export function recordOriginalText(chatId: number, messageId: number, text: string): void {
  cache.set(key(chatId, messageId), { text, ts: Date.now() });
}

// Returns null if we never saw the original (e.g. bot restarted since it was
// sent) — callers should treat that as "unknown" rather than "no link".
export function getOriginalText(chatId: number, messageId: number): string | null {
  const entry = cache.get(key(chatId, messageId));
  return entry ? entry.text : null;
}

function prune(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of cache) {
    if (v.ts < cutoff) cache.delete(k);
  }
}

// Register this FIRST (before nightMode/media/etc.), so the original text
// is cached even for messages other handlers go on to delete.
export function registerMessageCache(bot: Telegraf): void {
  bot.on("message", (ctx, next) => {
    const msg: any = ctx.message;
    const text = msg.text || msg.caption || "";
    if (text) recordOriginalText(ctx.chat.id, msg.message_id, text);
    return next();
  });

  setInterval(prune, 10 * 60 * 1000).unref();
}
