import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");

loadDotEnvLocal(envPath);

const graphVersion = process.env.META_GRAPH_VERSION || "v25.0";
const graphBase = `https://graph.facebook.com/${graphVersion}`;
const defaultFields = ["messages", "messaging_postbacks", "leadgen", "message_reads", "message_echoes", "messaging_referrals"];
const fields = (process.env.META_SUBSCRIBED_FIELDS || defaultFields.join(","))
  .split(",")
  .map((field) => field.trim())
  .filter(Boolean);

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check-only");
const skipAppSubscription = args.has("--skip-app-subscription");

const appId = process.env.META_APP_ID;
const appSecret = process.env.META_APP_SECRET;
const callbackUrl = process.env.META_CALLBACK_URL;
const verifyToken = process.env.FB_VERIFY_TOKEN;
const pages = readPages();

if (!appId) fail("Missing META_APP_ID in .env.local");
if (!appSecret) fail("Missing META_APP_SECRET in .env.local");
if (!verifyToken) fail("Missing FB_VERIFY_TOKEN in .env.local");
if (!checkOnly && !skipAppSubscription && !callbackUrl) {
  fail("Missing META_CALLBACK_URL in .env.local");
}
if (!pages.length) {
  fail("Missing page config. Add META_PAGE_1_ID and META_PAGE_1_TOKEN in .env.local");
}

console.log(`Meta Graph ${graphVersion}`);
console.log(`Fields: ${fields.join(", ")}`);
console.log(`Pages: ${pages.map((page) => page.id).join(", ")}`);

if (checkOnly) {
  await checkAppSubscription();
  for (const page of pages) await checkPageSubscription(page);
  process.exit(0);
}

if (!skipAppSubscription) {
  await subscribeApp();
  await checkAppSubscription();
}

for (const page of pages) {
  await subscribePage(page);
  await checkPageSubscription(page);
}

console.log("Done. If Lead Ads Testing Tool still reports lead permission issues, add this app in Business Settings > Lead Access Manager for each Page.");

async function subscribeApp() {
  console.log("Subscribing app webhook fields...");
  const result = await graphPost(`/${appId}/subscriptions`, {
    object: "page",
    callback_url: callbackUrl,
    verify_token: verifyToken,
    fields: fields.join(","),
    access_token: appAccessToken(),
  });
  console.log("App subscription:", result.success === true ? "ok" : JSON.stringify(result));
}

async function checkAppSubscription() {
  console.log("Checking app subscriptions...");
  const result = await graphGet(`/${appId}/subscriptions`, {
    access_token: appAccessToken(),
  });
  const pageSub = (result.data || []).find((item) => item.object === "page");
  if (!pageSub) {
    console.log("App subscription: no page subscription found");
    return;
  }
  console.log("App page fields:", (pageSub.fields || []).join(", "));
}

async function subscribePage(page) {
  console.log(`Subscribing page ${page.id}...`);
  const result = await graphPost(`/${page.id}/subscribed_apps`, {
    subscribed_fields: fields.join(","),
    access_token: page.token,
  });
  console.log(`Page ${page.id}:`, result.success === true ? "ok" : JSON.stringify(result));
}

async function checkPageSubscription(page) {
  console.log(`Checking page ${page.id} subscriptions...`);
  const result = await graphGet(`/${page.id}/subscribed_apps`, {
    access_token: page.token,
  });
  const apps = result.data || [];
  const current = apps.find((item) => String(item.id) === String(appId)) || apps[0];
  if (!current) {
    console.log(`Page ${page.id}: no subscribed app found`);
    return;
  }
  const subscribedFields = current.subscribed_fields || [];
  console.log(`Page ${page.id} fields:`, subscribedFields.join(", ") || "(none)");
}

async function graphGet(endpoint, params) {
  const url = new URL(`${graphBase}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return graphFetch(url, { method: "GET" });
}

async function graphPost(endpoint, params) {
  const url = new URL(`${graphBase}${endpoint}`);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }
  return graphFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function graphFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok || json.error) {
    const error = json.error || json;
    const safeUrl = redactToken(url.toString());
    throw new Error(`${options.method} ${safeUrl} failed: ${JSON.stringify(error)}`);
  }

  return json;
}

function appAccessToken() {
  return `${appId}|${appSecret}`;
}

function readPages() {
  const result = [];
  for (let index = 1; index <= 20; index += 1) {
    const id = process.env[`META_PAGE_${index}_ID`];
    const token = process.env[`META_PAGE_${index}_TOKEN`];
    if (id && token) result.push({ id, token });
  }
  return result;
}

function loadDotEnvLocal(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function redactToken(value) {
  return value.replace(/access_token=[^&]+/g, "access_token=REDACTED");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
