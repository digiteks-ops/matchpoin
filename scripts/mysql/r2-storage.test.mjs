import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolve.call(
      this,
      path.join(root, "src", `${request.slice(2)}.ts`),
      parent,
      isMain,
      options
    );
  }
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

const originalEnv = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucketName: process.env.R2_BUCKET_NAME,
};
process.env.R2_ACCOUNT_ID = "test-account";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.R2_BUCKET_NAME = "matchpoin-test";

try {
  const {
    createImageUploadUrl,
    isAllowedImageType,
    isOwnedEvidenceKey,
    signAssetReadUrl,
  } = require(path.join(root, "src", "lib", "storage", "r2.ts"));
  const matchId = "2f1e0f0f-87fd-4f4e-9af0-8210dca77862";
  const userId = "3a8524d1-1b6d-4272-98ed-0f721095d183";
  const upload = await createImageUploadUrl(
    userId,
    "image/webp",
    8192,
    { kind: "evidence", matchId }
  );
  assert.match(upload.objectKey, new RegExp(`^matches/${matchId}/evidence/${userId}/`));
  assert.match(upload.uploadUrl, /^https:\/\/test-account\.r2\.cloudflarestorage\.com\//);
  assert.match(upload.uploadUrl, /X-Amz-Expires=300/);
  assert.equal(upload.headers["Content-Type"], "image/webp");
  assert.equal(isAllowedImageType("image/svg+xml"), false);
  assert.equal(isOwnedEvidenceKey(upload.objectKey, matchId, userId), true);
  assert.equal(isOwnedEvidenceKey(upload.objectKey, matchId, "another-user"), false);
  await assert.rejects(
    createImageUploadUrl(userId, "image/svg+xml", 8192, { kind: "avatar" }),
    /Jenis file gambar tidak didukung/
  );
  await assert.rejects(signAssetReadUrl("../outside"), /Kunci objek tidak valid/);
  const readUrl = await signAssetReadUrl(upload.objectKey);
  assert.match(readUrl, /X-Amz-Expires=3600/);
  const avatarUpload = await createImageUploadUrl(
    userId,
    "image/jpeg",
    1024,
    { kind: "avatar" }
  );
  assert.match(avatarUpload.objectKey, new RegExp(`^avatars/${userId}/`));
  await assert.rejects(
    createImageUploadUrl(userId, "image/jpeg", 2 * 1024 * 1024, {
      kind: "evidence",
      matchId,
    }),
    /melebihi batas 1 MB/
  );
  await assert.rejects(
    createImageUploadUrl(userId, "image/jpeg", 6 * 1024 * 1024, { kind: "avatar" }),
    /melebihi batas 5 MB/
  );
  console.log("Cloudflare R2 signing and scope checks passed.");
} finally {
  if (originalEnv.accountId === undefined) delete process.env.R2_ACCOUNT_ID;
  else process.env.R2_ACCOUNT_ID = originalEnv.accountId;
  if (originalEnv.accessKeyId === undefined) delete process.env.R2_ACCESS_KEY_ID;
  else process.env.R2_ACCESS_KEY_ID = originalEnv.accessKeyId;
  if (originalEnv.secretAccessKey === undefined) delete process.env.R2_SECRET_ACCESS_KEY;
  else process.env.R2_SECRET_ACCESS_KEY = originalEnv.secretAccessKey;
  if (originalEnv.bucketName === undefined) delete process.env.R2_BUCKET_NAME;
  else process.env.R2_BUCKET_NAME = originalEnv.bucketName;
  Module._resolveFilename = originalResolve;
}
