import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function parse(path) {
  return ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
}

// Evaluate isolated production code so no API route or real transport is invoked.
function evaluate(code, globals = {}) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return vm.runInNewContext(js, globals);
}

function database(messages, setting) {
  return {
    from(table) {
      let rows = table === "messages" ? [...messages] : [];
      const query = {
        select: () => query,
        eq: (key, value) => { rows = rows.filter((row) => row[key] === value); return query; },
        in: (key, values) => { rows = rows.filter((row) => values.includes(row[key])); return query; },
        gte: (key, value) => { rows = rows.filter((row) => row[key] >= value); return query; },
        lte: (key, value) => { rows = rows.filter((row) => row[key] <= value); return query; },
        order: (key) => { rows.sort((a, b) => a[key].localeCompare(b[key])); return query; },
        limit: (count) => { rows = rows.slice(0, count); return query; },
        maybeSingle: async () => ({ data: setting }),
        upsert: (row, options) => {
          const existing = messages.find((message) => message.fb_message_id && message.fb_message_id === row.fb_message_id);
          if (existing) { if (!options?.ignoreDuplicates) Object.assign(existing, row); }
          else messages.push(row);
          return query;
        },
        update: () => query,
        then: (resolve, reject) => Promise.resolve({ data: rows, count: rows.length, error: null }).then(resolve, reject),
      };
      return query;
    },
  };
}

for (const [name, greeting, image, echoFirst] of [
  ["text and coupon use one combined image", "ข้อความทั้งหมด\n\nพร้อมคูปอง 😊", "https://example.test/coupon.png", false],
  ["image-only greeting stays one image", "", "https://example.test/coupon.png", false],
  ["echo arriving first is reconciled as auto-reply", "ข้อความทั้งหมด", "https://example.test/coupon.png", true],
]) {
  test(name, async () => {
    const messages = echoFirst ? [{ ...row("echo", false, -1), fb_message_id: "simulated-mid" }] : [];
    const sent = [];
    let prepared = 0;
    const setting = { trigger_new_conv: true, greeting_text: greeting, image_url: image, updated_at: stamp(0) };
    const send = evaluate(`${senderNode.getText(senderSource)}; sendAutoReply;`, {
      Date: class extends Date { static now() { return now; } },
      console: { error: (...args) => assert.fail(JSON.stringify(args)) },
      ensureAutoReplyImage: async (_db, saved) => {
        prepared++;
        assert.equal(saved.greeting_text, greeting);
        return "https://example.test/combined.png";
      },
      fetch: async (_url, options) => {
        sent.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ message_id: "simulated-mid" }) };
      },
    });
    await send(database(messages, setting), { id: "customer", created_at: stamp(0), last_message_at: stamp(0) }, "page", "recipient", "dummy", null, true);
    assert.equal(sent.length, 1);
    assert.equal(prepared, greeting ? 1 : 0);
    assert.equal(sent[0].message.text, undefined, "no second text bubble");
    assert.equal(sent[0].message.attachment.payload.url, greeting ? "https://example.test/combined.png" : image);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].is_auto_reply, true);
    assert.equal(messages[0].content, greeting || null);
  });
}

test("failed image preparation does not send a partial or split greeting", async () => {
  let sent = 0;
  const errors = [];
  const send = evaluate(`${senderNode.getText(senderSource)}; sendAutoReply;`, {
    Date: class extends Date { static now() { return now; } },
    console: { error: (...args) => errors.push(args) },
    ensureAutoReplyImage: async () => { throw new Error("image failed"); },
    fetch: async () => { sent++; throw new Error("must not send"); },
  });
  await send(database([], { trigger_new_conv: true, greeting_text: "Full text", image_url: "coupon", updated_at: stamp(0) }),
    { id: "customer", created_at: stamp(0), last_message_at: stamp(0) }, "page", "recipient", "dummy", null, true);
  assert.equal(sent, 0);
  assert.equal(errors.length, 1);
});

test("an outbound auto-reply refreshes the open chat without marking it read", async () => {
  const source = parse("components/ChatInbox.tsx");
  let handler;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "on" &&
        node.arguments[0]?.getText(source) === '"postgres_changes"' && node.arguments[1]?.getText(source).includes('table: "messages"')) {
      handler = node.arguments[2];
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(handler);
  let refreshed = 0;
  let writes = 0;
  const callback = evaluate(`(${handler.getText(source)});`, {
    selectedConvIdRef: { current: "customer" },
    refreshMessages: async () => { refreshed++; },
    supabase: { from: () => { writes++; throw new Error("must not mark read"); } },
  });
  await callback({ new: { conversation_id: "customer", direction: "outbound", is_auto_reply: true } });
  assert.equal(refreshed, 1);
  assert.equal(writes, 0);
});

const now = new Date("2026-09-15T06:00:00Z").getTime();
const stamp = (minutes) => new Date(now + minutes * 60_000).toISOString();
const row = (id, auto, minutes, conversation = "customer") => ({
  id, conversation_id: conversation, direction: "outbound", is_auto_reply: auto, created_at: stamp(minutes),
});
const senderSource = parse("app/api/webhook/facebook/route.ts");
const senderNode = senderSource.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "sendAutoReply");
assert.ok(senderNode, "Auto-reply sender must exist");

for (const [name, existing, expected] of [
  ["recent Sales reply does not block immediate auto-reply", [row("human", false, -1)], 1],
  ["recent auto-reply blocks duplicate greeting", [row("auto", true, -1)], 0],
  ["auto-reply older than five minutes allows greeting", [row("old", true, -6)], 1],
  ["another customer's auto-reply does not block greeting", [row("other", true, -1, "other")], 1],
]) {
  test(name, async () => {
    const messages = [...existing];
    const sent = [];
    const setting = { trigger_new_conv: true, trigger_from_ad: true, trigger_returning_days: 30, greeting_text: "Latest greeting\n\nNo extra dots", image_url: null };
    const send = evaluate(`${senderNode.getText(senderSource)}; sendAutoReply;`, {
      Date: class extends Date { static now() { return now; } },
      console: { error: (...args) => assert.fail(JSON.stringify(args)) },
      fetch: async (_url, options) => {
        sent.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ message_id: "simulated-mid" }) };
      },
    });
    // Existing customer arrives from an ad: eligible even if Sales recently replied.
    await send(database(messages, setting), { id: "customer", created_at: stamp(-1440), last_message_at: stamp(0) }, "page", "recipient", "dummy-token", "ad", false);
    assert.equal(sent.length, expected);
    if (expected) {
      assert.equal(sent[0].message.text, setting.greeting_text);
      assert.equal(messages.at(-1).is_auto_reply, true, "sent greeting must remain excluded from Sales metrics");
    }
  });
}

for (const path of ["components/Dashboard.tsx", "components/RemindersTab.tsx", "app/api/cron/daily-summary/route.ts"]) {
  test(`${path}: Sales response query excludes auto-replies`, async () => {
    const source = parse(path);
    const queries = [];
    function visit(node) {
      if (ts.isCallExpression(node) && !ts.isPropertyAccessExpression(node.parent)) {
        const text = node.getText(source);
        if (/^supabase\s*\.from\("messages"\)/.test(text) && /\.eq\("direction", "outbound"\)/.test(text)) queries.push(text);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.equal(queries.length, 1, "locate the actual outbound metric query");
    const result = await evaluate(`(${queries[0]});`, {
      supabase: database([
        row("auto-only", true, 0),
        row("early-auto", true, 1, "replied"),
        row("actual-sales-reply", false, 8, "replied"),
      ]),
      convIds: ["customer", "replied"], dateFrom: "2026-09-15", dateTo: "2026-09-15",
      since: stamp(-360), monthStart: stamp(-360),
    });
    assert.deepEqual(result.data.map((message) => message.id), ["actual-sales-reply"]);
    assert.equal(result.data[0].created_at, stamp(8), "use Sales reply at 8 min, not auto-reply at 1 min");
  });
}
