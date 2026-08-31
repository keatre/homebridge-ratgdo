/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * platform.manual.test.ts: Focused startup coverage for the optional one-shot manual discovery fallback.
 */
import type { API, Logging, PlatformConfig } from "homebridge";
import { loggedAt, makeCapturingLog, makeFakeOpenClient } from "./testing.helpers.ts";
import type { Bonjour } from "bonjour-service";
import { RatgdoPlatform } from "./platform.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("manual startup logs unreachable hosts without crashing and applies encryption precedence", async () => {

  const callbacks = new Map<string, () => void>();
  const api = {

    hap: {},
    on: (event: string, callback: () => void): void => { callbacks.set(event, callback); }
  } as unknown as API;
  const bonjour = { destroy: (): void => undefined,
    find: (): { update(): void } => ({ update: (): void => undefined }) } as unknown as Bonjour;
  const { entries, log } = makeCapturingLog();
  const openClient = makeFakeOpenClient(new Error("connection refused"));
  const config = { manualDevices: [ { encryptionKey: "manual-placeholder", host: "10.0.20.121" }, { host: "ratgdo.local" } ], name: "Ratgdo",
    options: ["Enable.Device.Encryption.Key=global-placeholder"], platform: "Ratgdo" } as PlatformConfig;

  new RatgdoPlatform(log as unknown as Logging, config, api, { createBonjour: () => bonjour, openClient });

  assert.doesNotThrow(() => callbacks.get("didFinishLaunching")?.(), "manual connection failures do not escape the startup callback");
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(openClient.calls.length, 2, "each configured host receives one startup attempt");
  assert.deepEqual(openClient.calls.map((call) => call.psk), [ "manual-placeholder", "global-placeholder" ], "a row key overrides the global key");
  assert.ok(loggedAt(entries, "error", "Failed to establish connection"), "the unreachable-host failure is logged");

  callbacks.get("shutdown")?.();
});
