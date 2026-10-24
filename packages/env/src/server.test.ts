import { describe, expect, it } from "vitest";

import { loadServerEnv } from "./server-env";

describe("loadServerEnv", () => {
  it("loads private research storage and scanner defaults or explicit settings", () => {
    const database = {
      DATABASE_URL: "postgres://user:pass@localhost:5432/app",
    };
    expect(loadServerEnv(database)).toMatchObject({
      RESEARCH_STORAGE_PATH: ".research-private",
      CLAMAV_HOST: "127.0.0.1",
      CLAMAV_PORT: 3310,
    });
    expect(
      loadServerEnv({
        ...database,
        RESEARCH_STORAGE_PATH: "/private/research",
        CLAMAV_HOST: "scanner.internal",
        CLAMAV_PORT: "3311",
      }),
    ).toMatchObject({
      RESEARCH_STORAGE_PATH: "/private/research",
      CLAMAV_HOST: "scanner.internal",
      CLAMAV_PORT: 3311,
    });
  });

  it.each(["0", "65536", "invalid"])(
    "rejects invalid scanner port %s",
    (port) => {
      expect(() =>
        loadServerEnv({
          DATABASE_URL: "postgres://user:pass@localhost:5432/app",
          CLAMAV_PORT: port,
        }),
      ).toThrow();
    },
  );

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
