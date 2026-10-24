import { z } from "zod";
import {
  type PartialDate,
  roundTypes,
  type SignalPayload,
  signalCategories,
  signalStatuses,
} from "./signal-types";

export function normalizeDecimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const head = whole.replace(/^0+(?=\d)/, "");
  const tail = fraction.replace(/0+$/, "");
  return tail ? `${head}.${tail}` : head;
}
export function compareDecimals(a: string, b: string): number {
  const [aw, af = ""] = normalizeDecimal(a).split(".");
  const [bw, bf = ""] = normalizeDecimal(b).split(".");
  if (aw.length !== bw.length) return aw.length < bw.length ? -1 : 1;
  if (aw !== bw) return aw < bw ? -1 : 1;
  const fractionA = af.padEnd(4, "0");
  const fractionB = bf.padEnd(4, "0");
  return fractionA === fractionB ? 0 : fractionA < fractionB ? -1 : 1;
}
export const decimalSchema = z
  .string()
  .regex(
    /^\d{1,20}(?:\.\d{1,4})?$/,
    "Use a decimal string with at most 20 integer and 4 fractional digits",
  )
  .transform(normalizeDecimal);
const currencies = new Set(Intl.supportedValuesOf("currency"));
export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((value) => currencies.has(value), "Unknown ISO currency");
function daysInMonth(year: number, month: number) {
  return (
    [
      31,
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ][month - 1] ?? 0
  );
}
export function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return (
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}
const daySchema = z
  .string()
  .refine(validDay, "A valid YYYY-MM-DD date is required");
export const partialDateSchema = z
  .object({
    precision: z.enum(["day", "month", "year", "unknown"]),
    value: z.string().nullable(),
  })
  .strict()
  .refine(({ precision, value }) => {
    if (precision === "unknown") return value === null;
    if (value === null) return false;
    if (precision === "day") return validDay(value);
    if (precision === "month")
      return /^\d{4}-\d{2}$/.test(value) && validDay(`${value}-01`);
    return /^\d{4}$/.test(value) && Number(value) > 0;
  }, "Date value must match its precision and be a real calendar date");
export function dateBounds(date: PartialDate): {
  dateStart: string | null;
  dateEnd: string | null;
} {
  if (date.precision === "unknown" || date.value === null)
    return { dateStart: null, dateEnd: null };
  if (date.precision === "day")
    return { dateStart: date.value, dateEnd: date.value };
  if (date.precision === "year")
    return { dateStart: `${date.value}-01-01`, dateEnd: `${date.value}-12-31` };
  const [year, month] = date.value.split("-").map(Number);
  return {
    dateStart: `${date.value}-01`,
    dateEnd: `${date.value}-${daysInMonth(year, month)}`,
  };
}
function publicSource(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      host.includes(".") &&
      !host.endsWith(".localhost") &&
      !host.endsWith(".local") &&
      !host.endsWith(".internal") &&
      !host.includes(":") &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(host)
    );
  } catch {
    return false;
  }
}
const sourceSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(2048)
      .refine(
        publicSource,
        "A public HTTP or HTTPS URL without credentials is required",
      ),
    title: z.string().trim().min(1).max(300),
    publishedOn: daySchema.nullable().optional().default(null),
    observedAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value).toISOString()),
  })
  .strict();
const financingSchema = z
  .object({
    roundType: z.enum(roundTypes),
    amount: decimalSchema.nullable(),
    currency: currencySchema.nullable(),
    investors: z
      .array(z.string().trim().min(1).max(200))
      .max(100)
      .transform((values) => [...new Set(values)].sort()),
    valuation: decimalSchema.nullable(),
    valuationKind: z.enum(["pre_money", "post_money"]).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.amount !== null || value.valuation !== null) &&
      value.currency === null
    )
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "Currency is required for monetary values",
      });
    if ((value.valuation === null) !== (value.valuationKind === null))
      context.addIssue({
        code: "custom",
        path: ["valuationKind"],
        message:
          "Valuation kind is required exactly when valuation is provided",
      });
  });
export const signalPayloadSchema = z
  .object({
    category: z.enum(signalCategories),
    title: z.string().trim().min(1).max(300),
    summary: z.string().trim().min(1).max(10000),
    eventDate: partialDateSchema,
    sources: z.array(sourceSchema).min(1).max(10),
    financing: financingSchema.nullable(),
    status: z.enum(signalStatuses),
  })
  .strict()
  .refine(
    (value) => (value.category === "financing") === (value.financing !== null),
    {
      path: ["financing"],
      message: "Financing terms are required only for financing signals",
    },
  );
export const financingFiltersSchema = z
  .object({
    currency: currencySchema.optional(),
    roundType: z.enum(roundTypes).optional(),
    minAmount: decimalSchema.optional(),
    maxAmount: decimalSchema.optional(),
    from: daySchema.optional(),
    to: daySchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.minAmount !== undefined || value.maxAmount !== undefined) &&
      !value.currency
    )
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "Currency is required for amount filters",
      });
    if (
      value.minAmount !== undefined &&
      value.maxAmount !== undefined &&
      compareDecimals(value.minAmount, value.maxAmount) > 0
    )
      context.addIssue({
        code: "custom",
        path: ["maxAmount"],
        message: "Maximum amount must be at least minimum amount",
      });
    if (value.from && value.to && value.from > value.to)
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "End date must follow start date",
      });
  });
export function duplicateKey(payload: SignalPayload): string {
  return JSON.stringify({
    category: payload.category,
    title: payload.title.trim().replace(/\s+/g, " ").toLowerCase(),
    eventDate: {
      precision: payload.eventDate.precision,
      value: payload.eventDate.value,
    },
    financing: payload.financing
      ? {
          roundType: payload.financing.roundType,
          amount:
            payload.financing.amount === null
              ? null
              : normalizeDecimal(payload.financing.amount),
          currency: payload.financing.currency,
          investors: [...new Set(payload.financing.investors)].sort(),
          valuation:
            payload.financing.valuation === null
              ? null
              : normalizeDecimal(payload.financing.valuation),
          valuationKind: payload.financing.valuationKind,
        }
      : null,
  });
}
export function materialChange(
  prior: SignalPayload,
  next: SignalPayload,
): boolean {
  return (
    duplicateKey(prior) !== duplicateKey(next) ||
    prior.title !== next.title ||
    prior.summary !== next.summary ||
    prior.status !== next.status
  );
}
