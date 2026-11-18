import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const originalResolve = Module._resolveFilename;
const originalTypeScriptLoader = Module._extensions[".ts"];
const originalEnv = {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER,
  password: process.env.SMTP_PASSWORD,
  from: process.env.SMTP_FROM,
};
const mockEmailJsPath = path.join(root, "scripts", "mysql", "__emailjs_stub__.js");
const clients = [];
let nextSendError = null;

class MockSmtpClient {
  constructor(configuration) {
    this.configuration = configuration;
    this.messages = [];
    this.closed = false;
    this.smtp = { close: () => (this.closed = true) };
    clients.push(this);
  }

  async sendAsync(message) {
    if (nextSendError) throw nextSendError;
    this.messages.push(message);
  }
}

Module._cache[mockEmailJsPath] = {
  id: mockEmailJsPath,
  filename: mockEmailJsPath,
  loaded: true,
  exports: { SMTPClient: MockSmtpClient },
};
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "emailjs") return mockEmailJsPath;
  return originalResolve.call(this, request, parent, isMain, options);
};
Module._extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(compiled, filename);
};

const { assertPasswordRecoveryEmailConfigured, sendPasswordRecoveryEmail } = require(
  path.join(root, "src", "lib", "email", "password-reset.ts")
);

function setSmtpEnvironment(values) {
  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"]) {
    delete process.env[key];
  }
  Object.assign(process.env, values);
  clients.length = 0;
  nextSendError = null;
}

test("requires host, from address, and a valid port", () => {
  setSmtpEnvironment({});
  assert.throws(assertPasswordRecoveryEmailConfigured, /SMTP_HOST, SMTP_FROM/);

  setSmtpEnvironment({ SMTP_HOST: "smtp.example.test", SMTP_FROM: "support@example.test" });
  assert.doesNotThrow(assertPasswordRecoveryEmailConfigured);

  process.env.SMTP_PORT = "70000";
  assert.throws(assertPasswordRecoveryEmailConfigured, /valid SMTP_PORT/);
});

test("requires SMTP username and password together", () => {
  setSmtpEnvironment({
    SMTP_HOST: "smtp.example.test",
    SMTP_FROM: "support@example.test",
    SMTP_USER: "matchpoin",
  });
  assert.throws(assertPasswordRecoveryEmailConfigured, /must either both be set or both be empty/);
});

test("sends a reset message using the default TLS-protected relay settings", async () => {
  setSmtpEnvironment({
    SMTP_HOST: "smtp.example.test",
    SMTP_FROM: "support@example.test",
  });
  const resetUrl = "https://matchpoin.example/reset?token=abc&source=email";

  await sendPasswordRecoveryEmail("player@example.test", resetUrl);

  assert.equal(clients.length, 1);
  assert.deepEqual(clients[0].configuration, {
    host: "smtp.example.test",
    port: 587,
    ssl: false,
    tls: { minVersion: "TLSv1.2" },
    timeout: 15_000,
  });
  assert.equal(clients[0].messages[0].from, "support@example.test");
  assert.equal(clients[0].messages[0].to, "player@example.test");
  assert.equal(clients[0].messages[0].text.includes(resetUrl), true);
  assert.equal(
    clients[0].messages[0].attachment[0].data.includes(
      "token=abc&amp;source=email"
    ),
    true
  );
  assert.equal(clients[0].closed, true);
});

test("uses implicit TLS for port 465 and closes the client after delivery errors", async () => {
  setSmtpEnvironment({
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "465",
    SMTP_USER: "matchpoin",
    SMTP_PASSWORD: "test-password",
    SMTP_FROM: "support@example.test",
  });
  nextSendError = new Error("mock delivery failure");

  await assert.rejects(
    sendPasswordRecoveryEmail("player@example.test", "https://matchpoin.example/reset"),
    /mock delivery failure/
  );

  assert.deepEqual(clients[0].configuration, {
    host: "smtp.example.test",
    port: 465,
    ssl: true,
    tls: false,
    user: "matchpoin",
    password: "test-password",
    timeout: 15_000,
  });
  assert.equal(clients[0].closed, true);
});

test.after(() => {
  Module._resolveFilename = originalResolve;
  if (originalTypeScriptLoader) Module._extensions[".ts"] = originalTypeScriptLoader;
  else delete Module._extensions[".ts"];
  for (const [key, value] of Object.entries({
    SMTP_HOST: originalEnv.host,
    SMTP_PORT: originalEnv.port,
    SMTP_USER: originalEnv.user,
    SMTP_PASSWORD: originalEnv.password,
    SMTP_FROM: originalEnv.from,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
