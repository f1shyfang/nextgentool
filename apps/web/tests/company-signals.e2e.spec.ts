import { mkdir } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

async function company(page: Page) {
  await page.goto("/companies/");
  await page.getByRole("button", { name: "Add company", exact: true }).click();
  await page
    .getByLabel("Company name", { exact: true })
    .fill("TEST Signal Labs");
  await page.getByRole("button", { name: "Check for matches" }).click();
  await page
    .getByRole("button", { name: "Create company", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "TEST Signal Labs", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Signals/ }).click();
}
async function draft(page: Page, financing = false) {
  await page.getByRole("button", { name: "Add signal", exact: true }).click();
  await page
    .getByLabel("Signal title", { exact: true })
    .fill(financing ? "TEST Series A in euros" : "TEST New research product");
  await page
    .getByLabel("Summary", { exact: true })
    .fill("TEST Company announcement verified against the source.");
  await page
    .getByLabel("Category", { exact: true })
    .selectOption(financing ? "financing" : "product");
  await page
    .getByLabel("Event date precision", { exact: true })
    .selectOption("month");
  await page.getByLabel("Event date", { exact: true }).fill("2026-01");
  await page
    .getByLabel("Source 1 title", { exact: true })
    .fill("TEST Company announcement");
  await page
    .getByLabel("Source 1 URL", { exact: true })
    .fill("https://example.com/announcement");
  await page
    .getByLabel("Source 1 observed at (UTC)", { exact: true })
    .fill("2026-01-31T12:00");
  if (financing) {
    await page
      .getByLabel("Round type", { exact: true })
      .selectOption("series_a");
    await page.getByLabel("Amount", { exact: true }).fill("12345678.1234");
    await page
      .getByLabel("Currency (ISO 3-letter code)", { exact: true })
      .fill("EUR");
    await page
      .getByLabel("Investors (comma separated)", { exact: true })
      .fill("TEST Capital, TEST Ventures");
  }
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Save signal", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save signal", exact: true }),
  ).toHaveCount(0);
}
const companyId = (page: Page) =>
  new URL(page.url()).pathname.split("/").filter(Boolean).at(-1);

test.beforeEach(async ({ request }) => {
  await request.post("/test/reset");
});

test("records product and original-currency financing, persists reload, and filters history", async ({
  page,
}) => {
  await company(page);
  await draft(page);
  await save(page);
  await draft(page, true);
  await save(page);
  await expect(
    page.getByRole("heading", { name: "TEST Series A in euros", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Signals/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "TEST New research product",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Signal category filter", { exact: true })
    .selectOption("product");
  await page.getByLabel("Signal from date", { exact: true }).fill("2026-01-20");
  await page.getByLabel("Signal to date", { exact: true }).fill("2026-01-21");
  await page
    .getByRole("button", { name: "Apply signal filters", exact: true })
    .click();
  await expect(
    page.getByText("1 of 2 signals match.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "TEST Series A in euros", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Signal category filter", { exact: true })
    .selectOption("financing");
  await page
    .getByRole("button", { name: "Apply signal filters", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "TEST Series A in euros", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Financing history", exact: true })
    .click();
  await expect(page.getByText(/EUR/).first()).toBeVisible();
  await page.getByLabel("Filter currency", { exact: true }).fill("USD");
  await page
    .getByRole("button", { name: "Apply financing filters", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "TEST Series A in euros", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Filter currency", { exact: true }).fill("EUR");
  await page
    .getByLabel("Filter round type", { exact: true })
    .selectOption("series_a");
  await page.getByLabel("From date", { exact: true }).fill("2026-01-20");
  await page.getByLabel("To date", { exact: true }).fill("2026-01-21");
  await page
    .getByRole("button", { name: "Apply financing filters", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "TEST Series A in euros", exact: true }),
  ).toBeVisible();
  await mkdir(".impeccable/review", { recursive: true });
  await page.screenshot({
    path: ".impeccable/review/signals-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".impeccable/review/signals-mobile.png",
    fullPage: true,
  });
});

test("corrections preserve history and retract financing", async ({
  page,
  request,
}) => {
  await company(page);
  await draft(page, true);
  await save(page);
  await page.getByRole("button", { name: "Edit signal", exact: true }).click();
  await page
    .getByLabel("Signal status", { exact: true })
    .selectOption("retracted");
  await page
    .getByLabel("Correction reason", { exact: true })
    .fill("TEST Announcement withdrawn by company");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save correction", exact: true }),
  ).toHaveCount(0);
  await page.getByText("Revision history (2)", { exact: true }).click();
  await expect(
    page.getByText("Reason: TEST Announcement withdrawn by company", {
      exact: true,
    }),
  ).toBeVisible();
  const response = await request.get(
    `/api/company-intelligence/companies/${companyId(page)}/signals/`,
  );
  const workspace = await response.json();
  expect(workspace.signals[0].revisions).toHaveLength(2);
  expect(workspace.signals[0].revisions[0].payload.status).toBe("unreviewed");
  expect(workspace.signals[0].revisions[1].payload.status).toBe("retracted");
  await page
    .getByRole("button", { name: "Financing history", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "TEST Series A in euros", exact: true }),
  ).toHaveCount(0);
});

test("viewers see signals without mutation controls and receive HTTP 403", async ({
  page,
  request,
  context,
}) => {
  await company(page);
  await draft(page);
  await save(page);
  const id = companyId(page);
  await request.get("/test/viewer");
  await context.addCookies([
    { name: "TEST_viewer", value: "1", domain: "127.0.0.1", path: "/" },
  ]);
  await page.reload();
  await page.getByRole("button", { name: /^Signals/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "TEST New research product",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add signal", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit signal", exact: true }),
  ).toHaveCount(0);
  const response = await request.post(
    `/api/company-intelligence/companies/${id}/signals/`,
    { headers: { Origin: "http://127.0.0.1:4327" }, data: {} },
  );
  expect(response.status()).toBe(403);
});

test("preserves a stale signal draft until explicit recovery", async ({
  page,
  request,
}) => {
  await company(page);
  await draft(page);
  await request.post("/test/concurrent-save", {
    data: { companyId: companyId(page) },
  });
  await page.getByRole("button", { name: "Save signal", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Load latest signals", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Signal title", { exact: true })).toHaveValue(
    "TEST New research product",
  );
  await page
    .getByRole("button", { name: "Load latest signals", exact: true })
    .click();
  await expect(page.getByLabel("Signal title", { exact: true })).toHaveValue(
    "TEST New research product",
  );
  await save(page);
});

test("retries a committed dropped response without duplicating the signal", async ({
  page,
  request,
}) => {
  await company(page);
  await draft(page);
  let committed = false;
  await page.route(
    "**/api/company-intelligence/companies/*/signals/",
    async (route) => {
      if (route.request().method() !== "POST" || committed) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      committed = true;
      await route.abort("failed");
    },
  );
  await page.getByRole("button", { name: "Save signal", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Signal title", { exact: true })).toHaveValue(
    "TEST New research product",
  );
  await save(page);
  const response = await request.get(
    `/api/company-intelligence/companies/${companyId(page)}/signals/`,
  );
  const workspace = await response.json();
  expect(workspace.signals).toHaveLength(1);
  expect(workspace.signals[0].revisions).toHaveLength(1);
});

test("signal stale recovery refreshes changed evidence without silently accepting a pending review", async ({
  page,
  request,
}) => {
  await company(page);
  const id = companyId(page);
  const origin = { Origin: "http://127.0.0.1:4327" };
  const created = await request.post(
    `/api/company-intelligence/companies/${id}/assertions/`,
    {
      headers: origin,
      data: {
        requestId: crypto.randomUUID(),
        expectedVersion: 1,
        field: "description",
        value: "TEST Shared company evidence",
        sourceUrl: "https://example.com/fact",
        sourceTitle: "TEST Company source",
        observedAt: "2026-01-01T00:00:00.000Z",
        claimKind: "reported",
      },
    },
  );
  expect(created.status()).toBe(201);
  const profile = await created.json();
  await page.reload();
  await page.getByRole("button", { name: "Evidence (1)", exact: true }).click();
  await page.getByText("Description · 1 claim", { exact: true }).click();
  await page.getByRole("button", { name: "Review fact", exact: true }).click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("TEST Pending analyst review reason");
  const reviewed = await request.post(
    `/api/company-intelligence/companies/${id}/assertions/${profile.assertions[0].id}/reviews/`,
    {
      headers: origin,
      data: {
        requestId: crypto.randomUUID(),
        expectedVersion: 2,
        reviewStatus: "disputed",
        reason: "TEST Conflicting source discovered externally",
      },
    },
  );
  expect(reviewed.status()).toBe(200);
  await page.getByRole("button", { name: "Signals", exact: true }).click();
  await draft(page);
  await page.getByRole("button", { name: "Save signal", exact: true }).click();
  await page
    .getByRole("button", { name: "Load latest signals", exact: true })
    .click();
  await page.getByRole("button", { name: "Evidence (1)", exact: true }).click();
  await page.getByText("Description · 1 claim", { exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Reason", exact: true }),
  ).toHaveValue("TEST Pending analyst review reason");
  await expect(
    page.getByText(/Claim: reported · Review: disputed/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save decision", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Load latest profile", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Reason", exact: true }),
  ).toHaveValue("TEST Pending analyst review reason");
  await expect(
    page.getByRole("button", { name: "Save decision", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Save decision", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Review fact: Description",
      exact: true,
    }),
  ).toHaveCount(0);
});
