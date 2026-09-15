import assert from "node:assert/strict";
import { test } from "node:test";
import { collectTypers, createTypingController } from "../lib/chat-typing.ts";

const settle = () => new Promise((resolve) => setImmediate(resolve));
function setup(t, trackResult = async () => "ok") {
  t.mock.timers.enable({ apis: ["setTimeout"] });
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

test("continuous typing avoids per-key network updates and stops after 3s idle", async (t) => {
  const { controller, calls } = setup(t);
  controller.start("a", "Sales");
  controller.setReady(true);
  await settle();
  t.mock.timers.tick(2000);
  controller.start("a", "Sales");
  t.mock.timers.tick(2999);
  assert.deepEqual(calls, ["a"]);
  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(calls, ["a", null]);
});

test("expired typing is not published after a slow initial connection", async (t) => {
  const { controller, calls } = setup(t);
  controller.start("a", "Sales");
  t.mock.timers.tick(3000);
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
  t.mock.timers.enable({ apis: ["setTimeout"] });
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
  }, "self");
  assert.deepEqual(result.get("a"), [{ userId: "first", name: "Sales" }, { userId: "second", name: "Sales" }]);
  assert.deepEqual(result.get("b"), [{ userId: "first", name: "Sales" }]);
});
