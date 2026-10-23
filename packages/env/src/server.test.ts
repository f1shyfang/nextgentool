import { describe, expect, it } from "vitest";

import { loadServerEnv } from "./server-env";

describe("loadServerEnv", () => {
  it("rejects a missing DATABASE_URL", () => {
    expect(() => loadServerEnv({})).toThrow();
  });

  it("rejects a malformed DATABASE_URL", () => {
    expect(() => loadServerEnv({ DATABASE_URL: "not-a-url" })).toThrow();
  });

  it("accepts a PostgreSQL DATABASE_URL", () => {
    expect(
      loadServerEnv({
        DATABASE_URL: "postgres://user:pass@localhost:5432/app",
      }),
    ).toMatchObject({
      DATABASE_URL: "postgres://user:pass@localhost:5432/app",
    });
  });

  it("rejects a valid URL that does not use PostgreSQL", () => {
    expect(() =>
      loadServerEnv({ DATABASE_URL: "https://example.com/database" }),
    ).toThrow();
  });

  it("rejects a remote PostgreSQL URL without TLS verification", () => {
    expect(() =>
      loadServerEnv({
        DATABASE_URL: "postgres://user:pass@db.example.com:5432/app",
      }),
    ).toThrow();
  });

  it("accepts a remote PostgreSQL URL with TLS verification", () => {
    expect(
      loadServerEnv({
        DATABASE_URL:
          "postgres://user:pass@db.example.com:5432/app?sslmode=verify-full",
      }),
    ).toMatchObject({
      DATABASE_URL:
        "postgres://user:pass@db.example.com:5432/app?sslmode=verify-full",
    });
  });
});
