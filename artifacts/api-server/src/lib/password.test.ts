import { describe, expect, it } from "vitest";
import { hashPassword, rejectWeakPassword, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("accepts the password it hashed", async () => {
    const stored = await hashPassword("correct horse battery staple");
    await expect(
      verifyPassword("correct horse battery staple", stored),
    ).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password entirely", stored)).resolves.toBe(
      false,
    );
  });

  it("salts, so the same password hashes differently every time", async () => {
    const a = await hashPassword("the same password");
    const b = await hashPassword("the same password");
    expect(a).not.toEqual(b);
    await expect(verifyPassword("the same password", a)).resolves.toBe(true);
    await expect(verifyPassword("the same password", b)).resolves.toBe(true);
  });

  it("records its parameters so they can be raised later", async () => {
    const stored = await hashPassword("anything at all here");
    expect(stored.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(stored.split("$")).toHaveLength(6);
  });

  it("never stores the password itself", async () => {
    const stored = await hashPassword("plaintext-must-not-appear");
    expect(stored).not.toContain("plaintext-must-not-appear");
  });

  // The important one. An OIDC account has no password hash, and "no password
  // set" must never be readable as "any password will do".
  it("refuses to authenticate an account with no password hash", async () => {
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
    await expect(verifyPassword("anything", undefined)).resolves.toBe(false);
    await expect(verifyPassword("anything", "")).resolves.toBe(false);
  });

  it("refuses an empty password even against a valid hash", async () => {
    const stored = await hashPassword("a real password here");
    await expect(verifyPassword("", stored)).resolves.toBe(false);
  });

  it("returns false rather than throwing on a malformed hash", async () => {
    for (const bad of [
      "not-a-hash",
      "scrypt$16384$8$1$onlyfiveparts",
      "bcrypt$16384$8$1$aa$bb",
      "scrypt$abc$8$1$aa$bb",
      "scrypt$16384$8$1$$",
      "scrypt$8$8$1$aa$bb", // N below the floor
    ]) {
      await expect(verifyPassword("anything", bad)).resolves.toBe(false);
    }
  });

  it("normalises unicode so the same typed password verifies", async () => {
    // U+00E9 vs e + U+0301 — visually identical, different bytes.
    const stored = await hashPassword("café password long");
    await expect(verifyPassword("café password long", stored)).resolves.toBe(
      true,
    );
  });
});

describe("rejectWeakPassword", () => {
  it("accepts a reasonable password", () => {
    expect(rejectWeakPassword("a-perfectly-fine-passphrase")).toBeNull();
  });

  it("rejects anything under 12 characters", () => {
    expect(rejectWeakPassword("short1!")).toMatch(/12 characters/);
  });

  it("rejects a single repeated character", () => {
    expect(rejectWeakPassword("aaaaaaaaaaaaaaaa")).toMatch(/repeated/);
  });

  it("rejects well-known strings even when long enough", () => {
    // This project shipped Admin@123 in a browser bundle once.
    expect(rejectWeakPassword("MyPassword12345")).toMatch(/guessable/);
    expect(rejectWeakPassword("please-changeme-now")).toMatch(/guessable/);
    expect(rejectWeakPassword("admin123-for-real")).toMatch(/guessable/);
  });
});

describe("changing a password", () => {
  // The route's own checks are exercised against a real database; these lock
  // the two properties that would silently weaken it if the helpers changed.
  it("refuses a new password the bootstrap would have refused", () => {
    // Same gate on both paths, or the change route becomes the way around it.
    expect(rejectWeakPassword("password1234")).toBeTruthy();
    expect(rejectWeakPassword("short")).toBeTruthy();
    expect(rejectWeakPassword("a-much-better-passphrase-42")).toBeNull();
  });

  it("treats a null hash as unverifiable, not as no password required", async () => {
    // An OIDC account has no password. If this returned true, any string would
    // pass as the "current password" and the account would gain one.
    expect(await verifyPassword("anything-at-all-here", null)).toBe(false);
  });
});
