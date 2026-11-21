import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const privacy = await read("src/app/privacy/page.tsx");
const terms = await read("src/app/terms/page.tsx");
const legal = await read("src/components/legal/legal-page.tsx");
const footer = await read("src/components/layout/footer.tsx");
const envExample = await read(".env.example");

test("privacy page is Indonesian and covers required disclosures", () => {
  for (const phrase of [
    "Kebijakan Privasi MATCHPOIN",
    "Data yang kami kumpulkan",
    "Google atau",
    "Facebook",
    "Supabase",
    "Vercel",
    "hapus-data",
    "30 hari",
  ]) {
    assert.ok(privacy.includes(phrase), phrase);
  }
  assert.doesNotMatch(privacy, /Privacy Policy of/);
});

test("terms page is Indonesian and covers conduct, risk and law", () => {
  for (const phrase of [
    "Ketentuan Layanan MATCHPOIN",
    "Perilaku pengguna",
    "Aktivitas olahraga dan risiko",
    "Pembatasan tanggung jawab",
    "hukum Republik Indonesia",
  ]) {
    assert.ok(terms.includes(phrase), phrase);
  }
});

test("legal pages share a mobile-friendly wrapper with a contact email", () => {
  assert.match(legal, /NEXT_PUBLIC_CONTACT_EMAIL/);
  assert.match(legal, /matchpoin\.id@gmail\.com/);
  assert.match(legal, /href="\/privacy"/);
  assert.match(legal, /href="\/terms"/);
  assert.match(legal, /sm:p-8/);
});

test("footer links to privacy, terms and data deletion", () => {
  assert.match(footer, /href="\/privacy"/);
  assert.match(footer, /href="\/terms"/);
  assert.match(footer, /href="\/privacy#hapus-data"/);
});

test("contact email is documented in .env.example", () => {
  assert.match(envExample, /NEXT_PUBLIC_CONTACT_EMAIL=/);
});