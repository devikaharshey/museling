import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listReportsAdmin,
  updateReportStatusAdmin,
  signEvidenceUrl,
} from "@/utils/safety.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({ meta: [{ title: "Reports · Admin" }] }),
  component: AdminReportsPage,
});

const STATUSES = [
  "pending",
  "under_review",
  "resolved_no_action",
  "resolved_warning",
  "resolved_suspended",
  "resolved_banned",
] as const;

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "pending"
      ? "bg-amber-100 text-amber-800"
      : status === "under_review"
        ? "bg-blue-100 text-blue-800"
        : status === "resolved_banned" || status === "resolved_suspended"
          ? "bg-red-100 text-red-800"
          : "bg-emerald-100 text-emerald-800";
  return (
    <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium " + color}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function AdminReportsPage() {
  const qc = useQueryClient();
  const reportsQ = useQuery({
    queryKey: ["admin_reports"],
    queryFn: () => listReportsAdmin(),
  });
  const [filter, setFilter] = useState<"open" | "all">("open");

  const updateMut = useMutation({
    mutationFn: (vars: { reportId: string; status: (typeof STATUSES)[number] }) =>
      updateReportStatusAdmin({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin_reports"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function openEvidence(path: string) {
    try {
      const { url } = await signEvidenceUrl({ data: { path } });
      if (url) window.open(url, "_blank", "noopener");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const rows = (reportsQ.data ?? []).filter((r: any) =>
    filter === "open" ? r.status === "pending" || r.status === "under_review" : true,
  );

  return (
    <main className="min-h-[100dvh] bg-background">
      <header className="border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to="/profile">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="font-display text-lg">Reports</h1>
          <div className="ml-auto">
            <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
              <SelectTrigger className="h-8 w-32 rounded-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-2xl space-y-3 px-4 py-5">
        {reportsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!reportsQ.isLoading && rows.length === 0 && (
          <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
            No reports.
          </p>
        )}
        {rows.map((r: any) => (
          <article key={r.id} className="rounded-2xl bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Reported user</p>
                <p className="text-sm font-medium">
                  {r.reported_user_name ?? r.reported_user_id}
                  <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                    {r.reported_user_account_status}
                  </span>
                </p>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {new Date(r.created_at).toLocaleString()}
            </p>

            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm">
              {r.description}
            </p>

            {r.evidence_url && (
              <button
                type="button"
                onClick={() => openEvidence(r.evidence_url)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> View evidence
              </button>
            )}

            <div className="mt-3 flex items-center gap-2">
              <Select
                value={r.status}
                onValueChange={(v) => updateMut.mutate({ reportId: r.id, status: v as any })}
              >
                <SelectTrigger className="h-9 w-56 rounded-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {r.resolved_at && (
                <span className="text-[10px] text-muted-foreground">
                  Resolved {new Date(r.resolved_at).toLocaleString()}
                </span>
              )}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Reporter identity is hidden. Resolving as <em>suspended</em> or <em>banned</em>{" "}
              excludes this person from future group matching.
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
