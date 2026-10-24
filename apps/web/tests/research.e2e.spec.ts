import { type Dialog, expect, type Page, test } from "@playwright/test";

// Browser integration: actual client/service/private storage; TEST actor and scanner fake.
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
const detail = (page: Page) =>
  page.getByRole("region", { name: "Research detail" });
async function upload(page: Page, name = "deck-v1.pdf") {
  await page
    .getByLabel("File", { exact: true })
    .setInputFiles({ name, mimeType: "application/pdf", buffer: pdf });
  await page
    .getByRole("button", { name: "Upload and check", exact: true })
    .click();
}
async function saved(page: Page) {
  await expect(
    page.getByText("All changes saved.", { exact: true }),
  ).toBeVisible();
}
async function note(page: Page) {
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await detail(page)
    .getByLabel("Title", { exact: true })
    .fill("TEST Founder interview");
  await detail(page)
    .getByRole("textbox", { name: "Note", exact: true })
    .fill("Original interview claim");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await saved(page);
}
test.beforeEach(async ({ request, page }) => {
  await request.post("/test/reset");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Research & Diligence", exact: true }),
  ).toBeVisible();
});

// Handle the real native confirmation, rather than replacing window.confirm.
async function confirmNavigation(
  page: Page,
  accept: boolean,
  action: () => Promise<unknown>,
) {
  const dialogs: { type: string; message: string }[] = [];
  const handle = async (dialog: Dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    if (accept) await dialog.accept();
    else await dialog.dismiss();
  };
  page.on("dialog", handle);
  try {
    await action();
    expect(dialogs).toEqual([
      { type: "confirm", message: "Discard your unsaved changes?" },
    ]);
  } finally {
    page.off("dialog", handle);
  }
}

test("cancelling navigation preserves an edited note across tabs, records and context switches", async ({
  page,
  request,
}) => {
  await note(page);
  const before = await (await request.get("/api/research")).json();
  const title = detail(page).getByLabel("Title", { exact: true });
  const body = detail(page).getByRole("textbox", { name: "Note", exact: true });
  await title.fill("TEST Preserved navigation draft");
  await body.fill("Unsaved analysis must survive Cancel.");
  const company = page.getByRole("combobox", { name: "Company", exact: true });
  const deal = page.locator(".research-scope").getByRole("combobox", {
    name: "Deal context",
    exact: true,
  });
  const originalCompany = await company.inputValue();
  for (const action of [
    () => page.getByRole("tab", { name: "Documents" }).click(),
    () => page.getByRole("button", { name: /TEST Founder interview/ }).click(),
    () => page.getByRole("button", { name: "New note", exact: true }).click(),
    () => company.selectOption({ label: "TEST Second Company" }),
    () => deal.selectOption({ label: "TEST Series A" }),
    () =>
      page.getByRole("button", { name: "Archive item", exact: true }).click(),
  ]) {
    await confirmNavigation(page, false, action);
    await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(company).toHaveValue(originalCompany);
    await expect(deal).toHaveValue("all");
    await expect(title).toHaveValue("TEST Preserved navigation draft");
    await expect(body).toHaveValue("Unsaved analysis must survive Cancel.");
    await expect(
      page.getByRole("button", { name: "Save note", exact: true }),
    ).toBeEnabled();
    expect((await (await request.get("/api/research")).json()).records).toEqual(
      before.records,
    );
  }
  // The original revision token remains valid after cancelling every action.
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await saved(page);
  const after = await (await request.get("/api/research")).json();
  expect(after.records[0].revisions).toHaveLength(2);
  expect(after.records[0].revisions.at(-1).body).toBe(
    "Unsaved analysis must survive Cancel.",
  );
});

test("accepting navigation discards edits and reopening restores only the saved note", async ({
  page,
  request,
}) => {
  await note(page);
  await detail(page)
    .getByRole("textbox", { name: "Note", exact: true })
    .fill("Discard this text");
  await confirmNavigation(page, true, () =>
    page.getByRole("tab", { name: "Documents" }).click(),
  );
  await expect(page.getByRole("tab", { name: "Documents" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    detail(page).getByRole("textbox", { name: "Note", exact: true }),
  ).toHaveCount(0);
  // Clean navigation must not ask for another confirmation.
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: /TEST Founder interview/ }).click();
  await expect(
    detail(page).getByRole("textbox", { name: "Note", exact: true }),
  ).toHaveValue("Original interview claim");
  await expect(
    page.getByRole("button", { name: "Save note", exact: true }),
  ).toBeDisabled();
  expect(dialogs).toEqual([]);
  expect(
    (await (await request.get("/api/research")).json()).records[0].revisions,
  ).toHaveLength(1);
});

test("cancelling navigation preserves a new memo and accepting discards it without saving", async ({
  page,
  request,
}) => {
  await page.getByRole("tab", { name: "Memo drafts" }).click();
  await page.getByRole("button", { name: "New memo", exact: true }).click();
  await detail(page)
    .getByLabel("Title", { exact: true })
    .fill("TEST Unsaved memo");
  await detail(page)
    .getByLabel("Investment thesis", { exact: false })
    .fill("Draft thesis");
  const leave = () => page.getByRole("tab", { name: "Notes" }).click();
  await confirmNavigation(page, false, leave);
  await expect(detail(page).getByLabel("Title", { exact: true })).toHaveValue(
    "TEST Unsaved memo",
  );
  await expect(
    detail(page).getByLabel("Investment thesis", { exact: false }),
  ).toHaveValue("Draft thesis");
  await confirmNavigation(page, true, leave);
  await page.getByRole("tab", { name: "Memo drafts" }).click();
  await page.getByRole("button", { name: "New memo", exact: true }).click();
  await expect(detail(page).getByLabel("Title", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    detail(page).getByLabel("Investment thesis", { exact: false }),
  ).toHaveValue("");
  expect(
    (await (await request.get("/api/research")).json()).records,
  ).toHaveLength(0);
});

test("cancelling upload navigation retains the selected file and metadata until explicit discard", async ({
  page,
  request,
}) => {
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await detail(page)
    .getByLabel("Title", { exact: true })
    .fill("TEST Unsaved upload");
  await page.getByLabel("File", { exact: true }).setInputFiles({
    name: "unsaved.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  for (const action of [
    () => page.getByRole("tab", { name: "Notes" }).click(),
    () => page.getByRole("button", { name: "Cancel", exact: true }).click(),
  ]) {
    await confirmNavigation(page, false, action);
    await expect(detail(page).getByLabel("Title", { exact: true })).toHaveValue(
      "TEST Unsaved upload",
    );
    expect(
      await page
        .getByLabel("File", { exact: true })
        .evaluate((input: HTMLInputElement) => input.files?.[0]?.name),
    ).toBe("unsaved.pdf");
    await expect(
      page.getByRole("button", { name: "Upload and check", exact: true }),
    ).toBeEnabled();
  }
  await confirmNavigation(page, true, () =>
    page.getByRole("button", { name: "Cancel", exact: true }).click(),
  );
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await expect(detail(page).getByLabel("Title", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByRole("button", { name: "Upload and check", exact: true }),
  ).toBeDisabled();
  expect(
    (await (await request.get("/api/research")).json()).documents,
  ).toHaveLength(0);
});

test("cancelling a page reload preserves the draft and its ability to save", async ({
  page,
  request,
}) => {
  await note(page);
  const body = detail(page).getByRole("textbox", { name: "Note", exact: true });
  await body.fill("Draft preserved after cancelling reload");
  const dialogs: string[] = [];
  const cancelUnload = async (dialog: Dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  };
  page.on("dialog", cancelUnload);
  try {
    // A cancelled reload may report ERR_ABORTED or wait for a load that never
    // happens. Bound that wait; the dialog and unchanged editor prove Cancel.
    const failure = await page.reload({ timeout: 2_000 }).then(
      () => null,
      (error: Error) => error,
    );
    expect(failure?.message).toMatch(/ERR_ABORTED|Timeout/);
    expect(dialogs).toEqual(["beforeunload"]);
  } finally {
    page.off("dialog", cancelUnload);
  }
  await expect(body).toHaveValue("Draft preserved after cancelling reload");
  expect(
    (await (await request.get("/api/research")).json()).records[0].revisions,
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await saved(page);
  expect(
    (await (await request.get("/api/research")).json()).records[0].revisions.at(
      -1,
    ).body,
  ).toBe("Draft preserved after cancelling reload");
});

test("cancelling metadata navigation retains edits and accepting restores saved metadata", async ({
  page,
  request,
}) => {
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await detail(page)
    .getByLabel("Title", { exact: true })
    .fill("TEST Saved deck");
  await upload(page);
  await page
    .getByRole("button", { name: "Edit metadata", exact: true })
    .click();
  await detail(page)
    .getByLabel("Title", { exact: true })
    .fill("TEST Unsaved title");
  await detail(page)
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Unsaved description");
  const leave = () => page.getByRole("tab", { name: "Notes" }).click();
  await confirmNavigation(page, false, leave);
  await expect(detail(page).getByLabel("Title", { exact: true })).toHaveValue(
    "TEST Unsaved title",
  );
  await expect(
    detail(page).getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Unsaved description");
  await confirmNavigation(page, true, leave);
  await page.getByRole("tab", { name: "Documents" }).click();
  await page.getByRole("button", { name: /TEST Saved deck/ }).click();
  await page
    .getByRole("button", { name: "Edit metadata", exact: true })
    .click();
  await expect(detail(page).getByLabel("Title", { exact: true })).toHaveValue(
    "TEST Saved deck",
  );
  await expect(
    detail(page).getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("");
  expect(
    (await (await request.get("/api/research")).json()).documents[0].title,
  ).toBe("TEST Saved deck");
});
test("uploads, note edits, memo sections and pinned historical citations", async ({
  page,
  request,
}, testInfo) => {
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await detail(page)
    .getByLabel("Title", { exact: true })
    .fill("TEST Investor deck");
  await upload(page);
  await expect(
    page.getByRole("link", { name: "Download version 1", exact: true }),
  ).toBeVisible();
  const initial = await (await request.get("/api/research")).json();
  const originalVersion = initial.documents[0].currentVersionId;
  await note(page);
  await page
    .getByRole("combobox", { name: "Source version", exact: true })
    .selectOption({ label: "TEST Investor deck · version 1 · deck-v1.pdf" });
  await page.getByLabel("Page or section locator (optional)").fill("Page 4");
  await page
    .getByRole("button", { name: "Link evidence", exact: true })
    .click();
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await saved(page);
  await page.getByRole("tab", { name: "Memo drafts" }).click();
  await page.getByRole("button", { name: "New memo", exact: true }).click();
  await detail(page)
    .getByLabel("Title", { exact: true })
    .fill("TEST Investment memo");
  await detail(page)
    .getByLabel("Investment thesis", { exact: false })
    .fill("Strong recurring demand");
  await detail(page)
    .getByLabel("Risks", { exact: false })
    .fill("Concentrated customer base");
  await expect(
    page.getByText("2 of 8 sections drafted", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Source version", exact: true })
    .selectOption({ label: "TEST Founder interview · revision 2" });
  await page
    .getByRole("button", { name: "Link evidence", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Source version", exact: true })
    .selectOption({ label: "TEST Investor deck · version 1 · deck-v1.pdf" });
  await page
    .getByRole("button", { name: "Link evidence", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save memo draft", exact: true })
    .click();
  await saved(page);
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: /TEST Founder interview/ }).click();
  await detail(page)
    .getByRole("textbox", { name: "Note", exact: true })
    .fill("Revised interview claim");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await saved(page);
  await page
    .getByRole("combobox", { name: "Revision history", exact: true })
    .selectOption({ index: 3 });
  await expect(
    detail(page).getByText("Original interview claim", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to current draft", exact: true })
    .click();
  await expect(
    detail(page).getByRole("textbox", { name: "Note", exact: true }),
  ).toHaveValue("Revised interview claim");
  await page.getByRole("tab", { name: "Documents" }).click();
  await page.getByRole("button", { name: /TEST Investor deck/ }).click();
  await page
    .getByRole("button", { name: "Upload new version", exact: true })
    .click();
  await upload(page, "deck-v2.pdf");
  await expect(
    page.getByRole("link", { name: "Download version 2", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Memo drafts" }).click();
  await page.getByRole("button", { name: /TEST Investment memo/ }).click();
  await page.getByRole("button", { name: /TEST Founder interview ·/ }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Original interview claim", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Revised interview claim", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close source", exact: true }).click();
  await expect(
    detail(page).getByRole("link", { name: /deck-v1.pdf/ }),
  ).toHaveAttribute("href", `/api/research/files/${originalVersion}`);
  expect(
    await (await request.get(`/api/research/files/${originalVersion}`)).body(),
  ).toEqual(pdf);
  const state = await (await request.get("/api/research")).json();
  expect(
    state.records.find((item: { kind: string }) => item.kind === "memo")
      .revisions[0].evidence[1].revisionId,
  ).toBe(originalVersion);
  await page.screenshot({
    path: testInfo.outputPath("research-desktop.png"),
    fullPage: true,
  });
});
test("stale saves preserve unsaved content and require explicit rebase and save", async ({
  page,
  request,
}) => {
  await note(page);
  await detail(page)
    .getByRole("textbox", { name: "Note", exact: true })
    .fill("My unsaved analysis");
  const state = await (await request.get("/api/research")).json();
  await request.post("/test/concurrent-save", {
    data: { id: state.records[0].id },
  });
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A newer revision was saved" }),
  ).toBeVisible();
  await expect(
    detail(page).getByRole("textbox", { name: "Note", exact: true }),
  ).toHaveValue("My unsaved analysis");
  await expect(
    page.getByText("TEST concurrent analyst update", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save note", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Keep my draft and rebase", exact: true })
    .click();
  await expect(
    page.getByText("Your changes have not been saved.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await saved(page);
  expect(
    (await (await request.get("/api/research")).json()).records[0].revisions.at(
      -1,
    ).body,
  ).toBe("My unsaved analysis");
});
test("scanner outage offers retry and blocks downloads until ready", async ({
  page,
  request,
}) => {
  await request.post("/test/scanner", { data: { fails: true } });
  await page
    .getByRole("button", { name: "Upload document", exact: true })
    .click();
  await detail(page)
    .getByLabel("Title", { exact: true })
    .fill("TEST Retry deck");
  await upload(page);
  await expect(
    page.getByRole("button", { name: "Retry processing", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download version 1", exact: true }),
  ).toHaveCount(0);
  const state = await (await request.get("/api/research")).json();
  expect(
    (
      await request.get(
        `/api/research/files/${state.documents[0].versions[0].id}`,
      )
    ).status(),
  ).toBe(403);
  await request.post("/test/scanner", { data: { fails: false } });
  await page
    .getByRole("button", { name: "Retry processing", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Download version 1", exact: true }),
  ).toBeVisible();
});
test("viewer reads saved research without edit controls and mobile overflow", async ({
  page,
}, testInfo) => {
  await note(page);
  await page.goto("/test/viewer");
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: /TEST Founder interview/ }).click();
  await expect(
    detail(page).getByText("Original interview claim", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New note", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save note", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("research-mobile.png"),
    fullPage: true,
  });
});

test("archiving discards an unsaved draft without resurrecting it on restore", async ({
  page,
  request,
}) => {
  await note(page);
  await detail(page)
    .getByRole("textbox", { name: "Note", exact: true })
    .fill("Unsaved text to discard");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Archive item", exact: true }).click();
  await expect(
    detail(page).getByRole("textbox", { name: "Note", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Show archived", { exact: true }).check();
  await page.getByRole("button", { name: /TEST Founder interview/ }).click();
  await expect(
    detail(page).getByText("Original interview claim", { exact: true }),
  ).toBeVisible();
  await expect(
    detail(page).getByText("Unsaved text to discard", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Restore from archive", exact: true })
    .click();
  await page.getByRole("button", { name: /TEST Founder interview/ }).click();
  await expect(
    detail(page).getByRole("textbox", { name: "Note", exact: true }),
  ).toHaveValue("Original interview claim");
  await expect(
    page.getByRole("button", { name: "Save note", exact: true }),
  ).toBeDisabled();
  expect(
    (await (await request.get("/api/research")).json()).records[0].revisions,
  ).toHaveLength(1);
});
