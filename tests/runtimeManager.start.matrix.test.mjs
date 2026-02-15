import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadRuntimeManager = async () => {
  const runtimeManagerPath = path.resolve(__dirname, "../services/runtimeManager.ts");
  const source = await fs.readFile(runtimeManagerPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  });
  const encoded = Buffer.from(transpiled.outputText, "utf8").toString("base64");
  const mod = await import(`data:text/javascript;base64,${encoded}`);
  return mod.runtimeManager;
};

const setTutorApp = (overrides = {}) => {
  const tutorApp = {
    ensureSidecarReady: async () => ({ ready: true }),
    getSettings: async () => ({
      activeProvider: "gpt",
      modelConfigs: {},
    }),
    getLlmKey: async () => ({ key: "sk-test" }),
    startRuntime: async () => ({ started: true, pid: 12345 }),
    ...overrides,
  };

  globalThis.window = { tutorApp };
  return tutorApp;
};

test("runtimeManager.start classifies sidecar readiness failure", async () => {
  const runtimeManager = await loadRuntimeManager();
  setTutorApp({
    ensureSidecarReady: async () => ({ ready: false, error: "download failed" }),
  });

  const result = await runtimeManager.start();
  assert.equal(result.started, false);
  assert.equal(result.failureStage, "sidecar");
  assert.equal(result.reason, "download failed");
});

test("runtimeManager.start classifies bootstrap failure when API key is missing", async () => {
  const runtimeManager = await loadRuntimeManager();
  let startRuntimeCalled = false;
  setTutorApp({
    getLlmKey: async () => ({ key: "" }),
    startRuntime: async () => {
      startRuntimeCalled = true;
      return { started: true };
    },
  });

  const result = await runtimeManager.start();
  assert.equal(result.started, false);
  assert.equal(result.failureStage, "bootstrap");
  assert.equal(result.reason, "missing api key");
  assert.equal(startRuntimeCalled, false);
});

test("runtimeManager.start classifies runtime process start failure", async () => {
  const runtimeManager = await loadRuntimeManager();
  setTutorApp({
    startRuntime: async () => ({ started: false, reason: "process failed" }),
  });

  const result = await runtimeManager.start();
  assert.equal(result.started, false);
  assert.equal(result.failureStage, "runtime_start");
  assert.equal(result.reason, "process failed");
});

test("runtimeManager.start returns started=true on success", async () => {
  const runtimeManager = await loadRuntimeManager();
  setTutorApp();

  const result = await runtimeManager.start();
  assert.equal(result.started, true);
  assert.equal(result.failureStage, undefined);
  assert.equal(result.pid, 12345);
});

