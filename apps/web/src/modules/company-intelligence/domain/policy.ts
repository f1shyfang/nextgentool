import {
  type Assertion,
  CompanyError,
  type Field,
  fields,
  type Override,
  type ResolvedField,
} from "./types";

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function normalizeDomain(input: string): string {
  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    )
      throw new Error();
    const host = url.hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\.$/, "");
    if (
      !host.includes(".") ||
      host.length > 253 ||
      /[^a-z0-9.-]/.test(host) ||
      host
        .split(".")
        .some(
          (part) =>
            !part ||
            part.length > 63 ||
            part.startsWith("-") ||
            part.endsWith("-"),
        )
    )
      throw new Error();
    return host;
  } catch {
    throw new CompanyError(
      "invalid",
      "Company domain must be a valid domain without a path or credentials",
    );
  }
}

const eligible = (assertion: Assertion) =>
  !assertion.superseded &&
  (assertion.reviewStatus === "verified" ||
    assertion.reviewStatus === "unreviewed");
const valueKey = (value: Assertion["value"]) =>
  JSON.stringify(Array.isArray(value) ? [...new Set(value)].sort() : value);

export function resolveFields(
  assertions: Assertion[],
  overrides: Override[],
): Record<Field, ResolvedField> {
  return Object.fromEntries(
    fields.map((field) => {
      const choices = assertions
        .filter((a) => a.field === field && eligible(a))
        .sort(
          (a, b) =>
            Number(b.reviewStatus === "verified") -
              Number(a.reviewStatus === "verified") ||
            Date.parse(b.observedAt) - Date.parse(a.observedAt) ||
            a.id.localeCompare(b.id),
        );
      const override = overrides
        .filter((o) => o.field === field && o.active)
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
        )[0];
      const pinned =
        override && choices.find((a) => a.id === override.assertionId);
      const selected = pinned || choices[0];
      return [
        field,
        {
          value: selected?.value ?? null,
          assertionId: selected?.id ?? null,
          conflict: new Set(choices.map((a) => valueKey(a.value))).size > 1,
          overrideId: override?.id ?? null,
          overrideSuspended: !!override && !pinned,
        } satisfies ResolvedField,
      ];
    }),
  ) as Record<Field, ResolvedField>;
}
