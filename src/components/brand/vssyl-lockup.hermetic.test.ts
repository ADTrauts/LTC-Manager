import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("Vssyl lockup combines the existing mark with a VSSYL wordmark", () => {
  const source = readFileSync(join(process.cwd(), "src/components/brand/vssyl-lockup.tsx"), "utf8");
  assert.match(source, /from "@\/components\/brand\/vssyl-mark"/);
  assert.match(source, /VssylMark/);
  assert.match(source, />VSSYL</);
  assert.match(source, /aria-label="Vssyl"/);
});

test("Vssyl lockup exposes restrained surface variants and both tones", () => {
  const source = readFileSync(join(process.cwd(), "src/components/brand/vssyl-lockup.tsx"), "utf8");
  for (const size of ["header", "auth", "console", "marketing"]) {
    assert.match(source, new RegExp(`\\b${size}\\b`));
  }
  assert.match(source, /tone === "inverse"/);
  assert.match(source, /text-\[#0b3d3a\]/);
  assert.match(source, /text-\[#e7f7f4\]/);
});

test("auth, console, and marketing chrome consume the shared lockup", () => {
  const auth = readFileSync(join(process.cwd(), "src/components/harbor-auth-frame.tsx"), "utf8");
  const pin = readFileSync(join(process.cwd(), "src/components/pin-login-form.tsx"), "utf8");
  const marketing = readFileSync(join(process.cwd(), "src/components/marketing/landing-page.tsx"), "utf8");

  assert.match(auth, /VssylLockup/);
  assert.match(auth, /tone="inverse"/);
  assert.match(auth, /size="auth"/);
  assert.match(auth, /Business Operations Platform/);
  assert.match(auth, /\{title\}/);

  const loginGate = readFileSync(join(process.cwd(), "src/components/login-gate.tsx"), "utf8");
  assert.match(loginGate, /Facility operations, without the noise\./);

  assert.doesNotMatch(pin, /uppercase tracking-wider[\s\S]*Vssyl/);

  assert.match(marketing, /VssylLockup/);
  assert.match(marketing, /size="marketing"/);
  assert.match(marketing, /Business Operations Platform/);
  assert.match(marketing, /Your operations\. All together\./);
});
