import assert from "node:assert/strict";
import test from "node:test";

import {
  isReferralCode,
  normalizeReferralCode,
  referralSignupPath,
  referralSignupUrl,
} from "../../src/lib/referral/referral-core.mjs";

test("normalizeReferralCode uppercases and strips unsafe characters", () => {
  assert.equal(normalizeReferralCode("  ab-12 cd  "), "AB12CD");
  assert.equal(normalizeReferralCode(null), "");
  assert.equal(normalizeReferralCode("abc1234567890123456"), "ABC1234567890123");
});

test("isReferralCode requires 4-16 characters", () => {
  assert.equal(isReferralCode("ABCD"), true);
  assert.equal(isReferralCode("A1B2C3"), true);
  assert.equal(isReferralCode("ABC"), false);
  assert.equal(isReferralCode(""), false);
});

test("referralSignupPath returns the register route", () => {
  assert.equal(referralSignupPath("ab12cd"), "/register?ref=AB12CD");
  assert.equal(referralSignupPath(""), "/register");
});

test("referralSignupUrl joins the origin without duplicate slashes", () => {
  assert.equal(
    referralSignupUrl("https://matchpoin.app/", "ab12cd"),
    "https://matchpoin.app/register?ref=AB12CD"
  );
  assert.equal(referralSignupUrl("", "ab12cd"), "/register?ref=AB12CD");
});