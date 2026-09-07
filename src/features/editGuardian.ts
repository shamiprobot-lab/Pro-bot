import { Telegraf } from "telegraf";
import { isUserAdmin, requireAdmin } from "../utils";
import { getChatConfig, saveChatConfig } from "../db";
import { getOriginalText } from "./messageCache";

// Spammers sometimes post a clean message then edit in a link/spam after
// passing initial review. Instead of deleting every single edit (which also
// nukes harmless typo fixes), this only deletes an edit if it now contains a
// link/invite that the original message didn't have. Off by default —
// enable per-chat with /editguard on.
const LINK_PATTERN = /(https?:\/\/|www\.|t\.me\/|telegram\.me\/|@\w{4,})/i;

export function registerEditGuardian(bot: Telegraf): void {
  bot.command("editguard", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const arg = (ctx.message as any).text.split(" ")[1]?.toLowerCase();
    if (arg !== "on" && arg !== "off") {
      return ctx.reply("Usage: /editguard on  |  /editguard off");
    }
    const config = getChatConfig(ctx.chat.id);
    config.editGuardEnabled = arg === "on";
    saveChatConfig(ctx.chat.id, config);
    await ctx.reply(
      `✏️ Edit Guard is now ${config.editGuardEnabled ? "ON" : "OFF"}.` +
        (config.editGuardEnabled
          ? " Edits that add a link will be removed."
          : "")
    );
  });

  bot.on("edited_message", async (ctx) => {
    const config = getChatConfig(ctx.chat.id);
    if (!config.editGuardEnabled) return;
    if (await isUserAdmin(ctx)) return;

    const edited: any = (ctx.update as any).edited_message;
    const newText: string = edited.text || edited.caption || "";
    if (!LINK_PATTERN.test(newText)) return; // no link in the edit at all, leave it alone

    // Only delete if this link is NEW — i.e. the original message (before
    // editing) didn't already contain one. If we never cached the original
    // (e.g. bot restarted between the post and the edit), fall back to the
    // old "any link" check rather than silently allowing a real evasion.
    const originalText = getOriginalText(ctx.chat.id, edited.message_id);
    if (originalText !== null && LINK_PATTERN.test(originalText)) return; // link was already there, not an edit-in

    try {
      await ctx.deleteMessage(edited.message_id);
    } catch {
      // ignore if bot lacks delete rights or message already gone
    }
  });
}
