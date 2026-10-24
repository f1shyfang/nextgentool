"use client";

import { useState } from "react";

export class CompanyApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function companyGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api/company-intelligence/${path}`, {
    cache: "no-store",
  });
  return readResponse<T>(response);
}
export async function companyQuery<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`/api/company-intelligence/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readResponse<T>(response);
}
async function readResponse<T>(response: Response): Promise<T> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new CompanyApiError(
      "unavailable",
      "The server did not return a response we could read. Try again.",
      response.status,
    );
  }
  if (!response.ok) {
    const error = data as { code?: string; error?: string };
    throw new CompanyApiError(
      error.code ?? "unavailable",
      error.error ?? "Your changes could not be saved. Try again.",
      response.status,
    );
  }
  return data as T;
}
type Attempt = { key: string; id: string };
type Result<T> = { ok: true; value: T } | { ok: false; error: CompanyApiError };

export function useCompanyMutation() {
  const [state, setState] = useState<{
    pending: boolean;
    error: CompanyApiError | null;
    attempt: Attempt | null;
  }>({ pending: false, error: null, attempt: null });
  async function run<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Result<T>> {
    const key = JSON.stringify({ path, body });
    const attempt =
      state.attempt?.key === key
        ? state.attempt
        : { key, id: crypto.randomUUID() };
    setState({ pending: true, error: null, attempt });
    try {
      const response = await fetch(`/api/company-intelligence/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, requestId: attempt.id }),
      });
      const value = await readResponse<T>(response);
      setState({ pending: false, error: null, attempt: null });
      return { ok: true, value };
    } catch (cause) {
      const error =
        cause instanceof CompanyApiError
          ? cause
          : new CompanyApiError(
              "network",
              "The connection was interrupted. Retry with the same details to check whether your changes were saved.",
              0,
            );
      setState({ pending: false, error, attempt });
      return { ok: false, error };
    }
  }
  return {
    pending: state.pending,
    error: state.error,
    run,
    clearError: () => setState((current) => ({ ...current, error: null })),
  };
}
