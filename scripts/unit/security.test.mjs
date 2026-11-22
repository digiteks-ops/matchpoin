import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isAuthPath,
  isProtectedAppPath,
} from "../../src/lib/auth/protected-routes.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("protected routes include /admin and exclude auth pages", () => {
  assert.equal(isProtectedAppPath("/admin"), true);
  assert.equal(isProtectedAppPath("/admin/tournaments"), true);
  assert.equal(isProtectedAppPath("/dashboard"), true);
  assert.equal(isProtectedAppPath("/login"), false);
  assert.equal(isAuthPath("/login"), true);
  assert.equal(isAuthPath("/admin"), false);
});

test("image validation limits (source contract)", async () => {
  const image = await read("src/lib/utils/image.ts");
  assert.match(image, /ALLOWED_IMAGE_TYPES = \["image\/jpeg", "image\/png", "image\/webp"\]/);
  assert.match(image, /MAX_ORIGINAL_IMAGE_BYTES = 10 \* 1024 \* 1024/);
  assert.match(image, /Format foto harus JPG, PNG, atau WEBP/);
  assert.match(image, /Ukuran foto asli maksimal 10 MB/);
});

test("double-submit is prevented on the critical forms", async () => {
  const tournament = await read("src/app/tournaments/page.tsx");
  assert.match(tournament, /disabled=\{\s*regLoading \|\|/);
  const createForm = await read("src/components/matches/create-match-form.tsx");
  assert.match(createForm, /disabled=\{[\s\S]*?isSubmitting/);
  const photo = await read("src/components/matches/photo-upload.tsx");
  assert.match(photo, /disabled=\{isUploading \|\| disabled\}/);
});

test("admin surfaces are guarded server-side", async () => {
  const layout = await read("src/app/admin/layout.tsx");
  assert.match(layout, /requirePageRole\("admin", "\/admin"\)/);
  const approve = await read(
    "src/app/api/admin/tournaments/registrations/[id]/approve/route.ts"
  );
  assert.match(approve, /requireApiRole\("admin"\)/);
});

test("storage write policies pin the caller folder", async () => {
  const migration = await read("supabase/migrations/00022_rls_hardening.sql");
  assert.match(migration, /split_part\(name, '\/', 3\) = \(select auth\.uid\(\)\)::text/);
  assert.match(migration, /bucket_id = 'avatars'/);
});

test("registration rejection status stays 'rejected'", async () => {
  const pages = await Promise.all([
    read("src/app/tournaments/page.tsx"),
    read("src/app/admin/tournaments/AdminTournamentsClient.tsx"),
  ]);
  for (const source of pages) {
    assert.doesNotMatch(source, /['"]declined['"]/);
  }
});
const ratingService = await read("src/lib/services/rating-service.ts");
const adminResultRoute = await read("src/app/api/admin/matches/[id]/result/route.ts");
const adminResultPage = await read("src/app/admin/matches/[id]/result/page.tsx");

test("admin result path skips photos and confirms immediately", () => {
  assert.match(ratingService, /options: \{ asAdmin\?: boolean \}/);
  assert.match(ratingService, /if \(!asAdmin && photos\.length === 0\)/);
  assert.match(ratingService, /status: asAdmin \? "confirmed" : "pending"/);
  assert.match(adminResultRoute, /requireApiRole\("admin"\)/);
  assert.match(adminResultPage, /requirePageRole\("admin"/);
});
