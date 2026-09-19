import assert from "node:assert/strict";
import { test } from "node:test";
import { collectTypers, createTypingController } from "../lib/chat-typing.ts";

const settle = () => new Promise((resolve) => setImmediate(resolve));
function setup(t, trackResult = async () => "ok") {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 100_000 });
  const calls = [];
  const controller = createTypingController({
    track: async (payload) => { calls.push(payload.conversationId); return trackResult(); },
    untrack: async () => { calls.push(null); return "ok"; },
  });
  t.after(() => controller.dispose());
  return { controller, calls };
}

test("keystrokes before subscription publish only after SUBSCRIBED", async (t) => {
  const { controller, calls } = setup(t);
  controller.start("a", "Sales");
  assert.deepEqual(calls, []);
  controller.setReady(true);
  await settle();
  assert.deepEqual(calls, ["a"]);
});

test("continuous typing avoids per-key updates, renews every 3s, and stops after 5s idle", async (t) => {
  const { controller, calls } = setup(t);
  controller.start("a", "Sales");
  controller.setReady(true);
  await settle();
  t.mock.timers.tick(2000);
  controller.start("a", "Sales");
  assert.deepEqual(calls, ["a"]);
  t.mock.timers.tick(1000);
  await settle();
  assert.deepEqual(calls, ["a", "a"]);
  t.mock.timers.tick(3000);
  await settle();
  assert.deepEqual(calls, ["a", "a", "a"]);
  t.mock.timers.tick(999);
  assert.equal(calls.includes(null), false);
  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(calls, ["a", "a", "a", null]);
  t.mock.timers.tick(6000);
  await settle();
  assert.equal(calls.length, 4);
});

test("expired typing is not published after a slow initial connection", async (t) => {
  const { controller, calls } = setup(t);
  controller.start("a", "Sales");
  t.mock.timers.tick(5000);
  controller.setReady(true);
  await settle();
  assert.deepEqual(calls, [null]);
});

test("active typing is republished after reconnection", async (t) => {
  const { controller, calls } = setup(t);
  controller.start("a", "Sales");
  controller.setReady(true);
  await settle();
  controller.setReady(false);
  controller.setReady(true);
  await settle();
  assert.deepEqual(calls, ["a", "a"]);
});

test("failed or rejected tracking retries on the next keystroke", async (t) => {
  let attempts = 0;
  const { controller, calls } = setup(t, async () => {
    if (++attempts === 1) throw new Error("disconnected");
    return attempts === 2 ? "timed out" : "ok";
  });
  controller.start("a", "Sales");
  controller.setReady(true);
  await settle();
  controller.start("a", "Sales");
  await settle();
  controller.start("a", "Sales");
  await settle();
  assert.deepEqual(calls, ["a", "a", "a"]);
});

test("a stop waits for pending tracking so typing cannot reappear after sending", async (t) => {
  let finish;
  const { controller, calls } = setup(t, () => new Promise((resolve) => { finish = resolve; }));
  controller.start("a", "Sales");
  controller.setReady(true);
  controller.stop("a");
  assert.deepEqual(calls, ["a"]);
  finish("ok");
  await settle();
  assert.deepEqual(calls, ["a", null]);
});

test("switching to a floating composer moves presence and ignores stops from another room", async (t) => {
  const { controller, calls } = setup(t);
  controller.start("a", "Sales");
  controller.setReady(true);
  await settle();
  controller.start("b", "Sales");
  await settle();
  controller.stop("a");
  assert.deepEqual(calls, ["a", "b"]);
  controller.stop("b");
  await settle();
  assert.deepEqual(calls, ["a", "b", null]);
});

test("cleanup prevents old timers and pending requests from publishing again", async (t) => {
  let finish;
  const { controller, calls } = setup(t, () => new Promise((resolve) => { finish = resolve; }));
  controller.start("a", "Sales");
  controller.setReady(true);
  controller.dispose();
  finish("ok");
  t.mock.timers.tick(5000);
  controller.setReady(true);
  controller.start("b", "Sales");
  await settle();
  assert.deepEqual(calls, ["a"]);
});

test("a failed stop retries without requiring another keystroke", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 100_000 });
  let stops = 0;
  const controller = createTypingController({
    track: async () => "ok",
    untrack: async () => ++stops === 1 ? "timed out" : "ok",
  });
  t.after(() => controller.dispose());
  controller.start("a", "Sales");
  controller.setReady(true);
  await settle();
  controller.stop();
  await settle();
  assert.equal(stops, 1);
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(stops, 2);
  t.mock.timers.tick(5000);
  await settle();
  assert.equal(stops, 2);
});

test("presence includes every tab, deduplicates by user per room, and keeps namesakes", () => {
  const presence = (conversationId, name = "Sales") => ({ typing: true, conversationId, name });
  const result = collectTypers({
    self: [presence("a")],
    first: [presence("a"), presence("b"), presence("a")],
    second: [presence("a")],
    idle: [{ typing: false, conversationId: "a", name: "Idle" }],
  }, "self", new Map([["first", Date.now()], ["second", Date.now()]]));
  assert.deepEqual(result.get("a"), [{ userId: "first", name: "Sales" }, { userId: "second", name: "Sales" }]);
  assert.deepEqual(result.get("b"), [{ userId: "first", name: "Sales" }]);
});

for (const oldResult of ["ok", "timed out", "reject"]) {
  test(`reconnect immediately publishes while old track is pending; late ${oldResult} cannot release new request`, async (t) => {
    const requests = [];
    const { controller, calls } = setup(t, () => new Promise((resolve, reject) => {
      requests.push({ resolve, reject });
    }));
    controller.start("a", "Sales");
    controller.setReady(true);
    controller.setReady(false);
    controller.setReady(true);
    assert.deepEqual(calls, ["a", "a"]); // No clock advance or watchdog required.
    if (oldResult === "reject") requests[0].reject(new Error("old connection closed"));
    else requests[0].resolve(oldResult);
    await settle();
    controller.stop();
    assert.deepEqual(calls, ["a", "a"]); // New track still owns the lock.
    requests[1].resolve("ok");
    await settle();
    assert.deepEqual(calls, ["a", "a", null]);
  });
}

test("reconnect does not resurrect typing stopped while old track is pending", async (t) => {
  let finish;
  const { controller, calls } = setup(t, () => new Promise((resolve) => { finish = resolve; }));
  controller.start("a", "Sales");
  controller.setReady(true);
  controller.setReady(false);
  controller.stop();
  controller.setReady(true);
  await settle();
  assert.deepEqual(calls, ["a", null]);
  finish("ok");
  await settle();
  assert.deepEqual(calls, ["a", null]);
});

test("watchdog sends stop even when old track never resolves and heartbeat was cleared", async (t) => {
  const { controller, calls } = setup(t, () => new Promise(() => {}));
  controller.start("a", "Sales");
  controller.setReady(true);
  controller.stop();
  t.mock.timers.tick(6000);
  await settle();
  assert.deepEqual(calls, ["a", null]);
  controller.dispose();
  t.mock.timers.tick(20000);
  await settle();
  assert.deepEqual(calls, ["a", null]);
});

test("failed start retries after 1s without another keystroke", async (t) => {
  let attempts = 0;
  const { controller, calls } = setup(t, async () => ++attempts === 1 ? "timed out" : "ok");
  controller.start("a", "Sales");
  controller.setReady(true);
  await settle();
  t.mock.timers.tick(1000);
  await settle();
  assert.deepEqual(calls, ["a", "a"]);
});

test("receiver expires stale typing after 12s without sync and accepts a fresh renewal", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const state = { other: [{ typing: true, conversationId: "a", name: "Sales" }] };
  const lastSeen = new Map([["other", Date.now()]]);
  assert.equal(collectTypers(state, "self", lastSeen).get("a").length, 1);
  t.mock.timers.tick(12001);
  assert.equal(collectTypers(state, "self", lastSeen).size, 0);
  lastSeen.set("other", Date.now());
  assert.equal(collectTypers(state, "self", lastSeen).get("a").length, 1);
});
