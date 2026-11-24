import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const nav = { pathname: "/en/knowledge" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: "en" }),
}));
const upload = vi.hoisted(() => vi.fn());
vi.mock("../api/upload", () => ({ uploadWithProgress: upload }));

import { createApiClient } from "../api/client";
import { AppProviders, makeQueryClient } from "../api/queries/provider";
import { Toaster } from "../components/Toast/Toast";
import { visibleNav } from "../auth/nav";
import KnowledgePage from "./[locale]/(admin)/knowledge/page";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const ME = (roles: string[]) => ({ id: "me", email: "a@b.c", phone: null, display_name: "Admin", preferred_language: "en", roles, permissions: [], active_facility: null, is_platform_admin: roles.includes("platform_admin") });

const doc = (over: Record<string, unknown> = {}) => ({
  id: "d1", title: "Davidson's", publisher: "Elsevier", version: "25th", language: "en", rights_statement: "", status: "READY", error: "", size: 1,
  page_count: 1412, chunk_count: 100, embedded_count: 100, approved: false, approved_by_name: null, reviewer_name: "", approved_at: null, retired_at: null,
  created_at: "2026-11-24T00:00:00Z", ...over,
});

function mount(roles: string[], docs: unknown[] | "error", extra: Record<string, (req: Request) => Response> = {}) {
  const calls: { key: string; body: string }[] = [];
  const fetchImpl = async (req: Request) => {
    const u = new URL(req.url);
    const key = `${req.method} ${u.pathname.replace("/api/v1", "")}${u.search}`;
    calls.push({ key, body: await req.clone().text() });
    if (key === "GET /auth/me") return json(ME(roles));
    if (key === "GET /admin/knowledge/documents") return docs === "error" ? json({ error: { code: "x", message: "x" } }, 500) : json({ results: docs, next_cursor: null });
    const h = Object.entries(extra).find(([k]) => key.startsWith(k));
    return h ? h[1](req) : json({ error: { code: "not_found", message: "no" } }, 404);
  };
  const client = createApiClient({ baseUrl: "http://localhost/api/v1", getCsrfToken: () => "csrf", fetchImpl: fetchImpl as unknown as typeof fetch });
  render(
    <AppProviders client={client} queryClient={makeQueryClient()}>
      <Toaster><KnowledgePage /></Toaster>
    </AppProviders>,
  );
  return { calls };
}

beforeEach(() => upload.mockReset());

describe("/knowledge (D-29)", () => {
  it("lists books with status, progress and approval, as words and numbers", async () => {
    mount(["platform_admin"], [doc(), doc({ id: "d2", title: "Draft book", status: "PROCESSING", chunk_count: 50, embedded_count: 20 }),
      doc({ id: "d3", title: "Approved book", approved: true, approved_by_name: "Admin", reviewer_name: "Dr Rahman", approved_at: "2026-11-24T01:00:00Z" })]);
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Davidson's")).toBeInTheDocument();
    expect(screen.getByText("20 of 50 embedded")).toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getByText(/Approved by Admin, reviewer Dr Rahman/)).toBeInTheDocument();
    expect(screen.getAllByText("Not approved").length).toBeGreaterThan(0);
  });

  it("is only for platform admins", async () => {
    mount(["facility_admin"], []);
    expect(await screen.findByText("Only a platform admin can manage the knowledge base.")).toBeInTheDocument();
  });

  it("shows an empty state and an error state with retry", async () => {
    mount(["platform_admin"], []);
    expect(await screen.findByText("No books yet. Upload a PDF to begin.")).toBeInTheDocument();
  });

  it("approval needs a reviewer name and the rights box, then posts both", async () => {
    const { calls } = mount(["platform_admin"], [doc()], { "POST /admin/knowledge/documents/d1/approve": () => json(doc({ approved: true })) });
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(await within(dialog).findByText("Enter the reviewer’s name.")).toBeInTheDocument();
    expect(calls.some((c) => c.key.includes("/approve"))).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/Clinical reviewer/), { target: { value: "Dr Rahman" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(await within(dialog).findByText("Confirm the rights to continue.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText(/I confirm we have the right/));
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(calls.some((c) => c.key.includes("/approve") && c.body.includes("Dr Rahman") && c.body.includes("true"))).toBe(true));
  });

  it("retiring asks for confirmation first", async () => {
    const { calls } = mount(["platform_admin"], [doc({ approved: true, approved_by_name: "A", reviewer_name: "R" })], { "POST /admin/knowledge/documents/d1/retire": () => json(doc()) });
    fireEvent.click(await screen.findByRole("button", { name: "Retire" }));
    expect(calls.some((c) => c.key.includes("/retire"))).toBe(false);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Retire" }));
    await waitFor(() => expect(calls.some((c) => c.key === "POST /admin/knowledge/documents/d1/retire")).toBe(true));
  });

  it("a failed book can be retried, and an approved book cannot be deleted", async () => {
    const { calls } = mount(["platform_admin"], [doc({ id: "f1", title: "Failed", status: "FAILED", error: "Embedding stopped at 5/10" }), doc({ id: "a1", title: "Live", approved: true, approved_by_name: "A", reviewer_name: "R" })],
      { "POST /admin/knowledge/documents/f1/retry": () => json(doc({ id: "f1", status: "PROCESSING" }), 202) });
    expect(await screen.findByText("Embedding stopped at 5/10")).toBeInTheDocument();
    const live = within(screen.getByRole("table")).getByText("Live").closest("tr")!;
    expect(within(live).queryByRole("button", { name: "Delete" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls.some((c) => c.key === "POST /admin/knowledge/documents/f1/retry")).toBe(true));
  });

  it("deleting asks for confirmation and then calls DELETE", async () => {
    const { calls } = mount(["platform_admin"], [doc()], { "DELETE /admin/knowledge/documents/d1": () => new Response(null, { status: 204 }) });
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.some((c) => c.key === "DELETE /admin/knowledge/documents/d1")).toBe(true));
  });

  it("tries a question against a book and shows document, page and text", async () => {
    mount(["platform_admin"], [doc()], {
      "GET /admin/knowledge/search": () => json({ results: [{ document_name: "Davidson's", page_number: 399, relevant_information: "Incubation averages 2-4 days.", score: 0.03 }] }),
    });
    fireEvent.change(await screen.findByLabelText("Question"), { target: { value: "incubation period" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText(/Davidson's, page 399/)).toBeInTheDocument();
    expect(screen.getByText(/Incubation averages/)).toBeInTheDocument();
  });

  it("the upload dialog validates, then uploads with progress", async () => {
    upload.mockImplementation(async (_p: string, _f: FormData, onProgress: (n: number) => void) => { onProgress(0.5); return doc(); });
    mount(["platform_admin"], []);
    fireEvent.click(await screen.findByRole("button", { name: "Upload a book" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload a book" }));
    expect(await within(dialog).findByText("Choose a PDF file.")).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
    const file = new File(["%PDF-1.4"], "b.pdf", { type: "application/pdf" });
    fireEvent.change(within(dialog).getByLabelText(/PDF file/), { target: { files: [file] } });
    fireEvent.change(within(dialog).getByLabelText(/Title/), { target: { value: "Book" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload a book" }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const form = upload.mock.calls[0][1] as FormData;
    expect(form.get("title")).toBe("Book");
    expect((form.get("file") as File).name).toBe("b.pdf");
  });
});

describe("navigation", () => {
  it("shows Knowledge base to platform admins only", () => {
    const labels = (roles: string[]) => visibleNav(ME(roles) as never, "admin").map((i) => i.id);
    expect(labels(["platform_admin"])).toContain("knowledge");
    expect(labels(["facility_admin"])).not.toContain("knowledge");
  });
});
