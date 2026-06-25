#!/usr/bin/env node
// ops/cockpit-setup.mjs — one-time wiring for the founder's Telegram "cockpit". After you create a bot
// with @BotFather and DM it /start, this discovers your chat_id and sends a test "cockpit online" message.
// Token + chat_id are SECRETS — pass via --env-file=.env, never hard-code or print the token.
//
//   node --env-file=.env ops/cockpit-setup.mjs --chat    # discover chat_id (after you DM the bot /start)
//   node --env-file=.env ops/cockpit-setup.mjs --test    # send a test message to TELEGRAM_CHAT_ID
//   node --env-file=.env ops/cockpit-setup.mjs           # discover + (if chat set) send the test

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN (via --env-file=.env). Create a bot in Telegram with @BotFather, copy its token.");
  process.exit(1);
}
const API = `https://api.telegram.org/bot${token}`;
const args = process.argv.slice(2);
const wantChat = args.includes("--chat") || args.length === 0;
const wantTest = args.includes("--test") || args.length === 0;

async function discover() {
  const res = await fetch(`${API}/getUpdates`);
  const j = await res.json();
  if (!j.ok) {
    console.error("getUpdates failed (is the token right?):", JSON.stringify(j));
    process.exit(1);
  }
  const chats = new Map();
  for (const u of j.result || []) {
    const m = u.message || u.edited_message || u.channel_post;
    const c = m?.chat;
    if (c) {
      const name = c.title || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || "";
      chats.set(c.id, `${c.type} · ${name}`);
    }
  }
  if (!chats.size) {
    console.log("No chats yet. In Telegram, open your bot and send it /start (or any message), then re-run with --chat.");
    return null;
  }
  console.log("Chats that have messaged your bot — put the right one in .env:");
  for (const [id, label] of chats) console.log(`  TELEGRAM_CHAT_ID=${id}   (${label})`);
  return [...chats.keys()][0];
}

async function test(chatId) {
  const id = chatId || process.env.TELEGRAM_CHAT_ID;
  if (!id) {
    console.log("No TELEGRAM_CHAT_ID set — run --chat first, add it to .env, then --test.");
    return;
  }
  const res = await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: id,
      text: '✅ Waimd factory cockpit online.\n\nYou\'ll get the daily digest here. DM me commands like "status", "revenue", "leads", or "approve the waimd batch". I only act on what you ask — nothing irreversible without your say-so.',
    }),
  });
  const j = await res.json();
  console.log(j.ok ? `test message sent to ${id}` : `send failed: ${JSON.stringify(j)}`);
}

let discovered = null;
if (wantChat) discovered = await discover();
if (wantTest) await test(discovered);
