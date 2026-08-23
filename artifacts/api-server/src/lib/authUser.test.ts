import { afterEach, describe, expect, it } from "vitest";
import { grantRolesFor, toAuthUser, type UserRecord } from "./authUser";

const ORIGINAL_ADMIN_EMAILS = process.env["ADMIN_EMAILS"];

afterEach(() => {
  if (ORIGINAL_ADMIN_EMAILS === undefined) {
    delete process.env["ADMIN_EMAILS"];
  } else {
    process.env["ADMIN_EMAILS"] = ORIGINAL_ADMIN_EMAILS;
  }
});

function user(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "oidc-sub-1",
    email: "nurse@hospital.example",
    firstName: "Sara",
    lastName: "Ahmed",
    profileImageUrl: null,
    roles: ["user"],
    ...overrides,
  };
}

describe("grantRolesFor", () => {
  it("grants only the user role when ADMIN_EMAILS is unset", () => {
    delete process.env["ADMIN_EMAILS"];
    expect(grantRolesFor("anyone@hospital.example")).toEqual(["user"]);
  });

  it("grants admin to a listed email", () => {
    process.env["ADMIN_EMAILS"] = "boss@hospital.example";
    expect(grantRolesFor("boss@hospital.example")).toEqual(["user", "admin"]);
  });

  it("matches case-insensitively and tolerates whitespace in the list", () => {
    process.env["ADMIN_EMAILS"] = " Boss@Hospital.example , other@x.example ";
    expect(grantRolesFor("boss@hospital.EXAMPLE")).toContain("admin");
    expect(grantRolesFor("other@x.example")).toContain("admin");
  });

  it("does not grant admin to an unlisted email", () => {
    process.env["ADMIN_EMAILS"] = "boss@hospital.example";
    expect(grantRolesFor("nurse@hospital.example")).toEqual(["user"]);
  });

  it("does not grant admin when the user has no email", () => {
    process.env["ADMIN_EMAILS"] = "boss@hospital.example";
    expect(grantRolesFor(null)).toEqual(["user"]);
  });

  it("ignores an empty ADMIN_EMAILS rather than matching an empty email", () => {
    process.env["ADMIN_EMAILS"] = ",, ,";
    expect(grantRolesFor("")).toEqual(["user"]);
  });
});

describe("toAuthUser", () => {
  it("satisfies the contract's required fields", () => {
    // The spec requires id, name and roles. Omitting them is what made
    // /api/auth/user throw a Zod error and 500 for every logged-in user.
    const result = toAuthUser(user());
    expect(result.id).toBe("oidc-sub-1");
    expect(result.name).toBe("Sara Ahmed");
    expect(result.roles).toEqual(["user"]);
  });

  it("falls back to email, then id, when no name is present", () => {
    expect(toAuthUser(user({ firstName: null, lastName: null })).name).toBe(
      "nurse@hospital.example",
    );
    expect(
      toAuthUser(user({ firstName: null, lastName: null, email: null })).name,
    ).toBe("oidc-sub-1");
  });

  it("uses whichever single name part exists", () => {
    expect(toAuthUser(user({ lastName: null })).name).toBe("Sara");
    expect(toAuthUser(user({ firstName: null })).name).toBe("Ahmed");
  });

  it("omits optional fields rather than sending null", () => {
    // They are optional-not-nullable in the contract, so null fails validation.
    const result = toAuthUser(user({ email: null, profileImageUrl: null }));
    expect("email" in result).toBe(false);
    expect("profileImageUrl" in result).toBe(false);
  });

  it("passes through the stored roles verbatim", () => {
    expect(toAuthUser(user({ roles: ["user", "admin"] })).roles).toEqual([
      "user",
      "admin",
    ]);
  });
});
