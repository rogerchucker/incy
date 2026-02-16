"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Incident } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";

const statusClasses: Record<string, string> = {
  triggered: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  acknowledged: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  resolved: "bg-green-200 text-green-900 dark:bg-green-800/50 dark:text-green-300",
};

const severityClasses: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  warning: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  info: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
};

type SortKey = "incident_number" | "title" | "service" | "status" | "severity" | "assignee" | "created_at" | "updated_at";
type SortDir = "asc" | "desc";

const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
const statusOrder: Record<string, number> = { triggered: 0, acknowledged: 1, resolved: 2 };

export default function IncidentsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, error } = useQuery({
    queryKey: ["incidents", statusFilter],
    queryFn: () =>
      api.listIncidents(
        statusFilter !== "all" ? { status: statusFilter } : undefined
      ),
  });

  const { data: servicesData } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.listServices(),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.listUsers(),
  });

  const serviceMap = new Map(
    servicesData?.services.map((s) => [s.id, s.name]) ?? []
  );
  const userMap = new Map(
    usersData?.users.map((u) => [u.id, u.name]) ?? []
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created_at" || key === "updated_at" ? "desc" : "asc");
    }
  };

  const sortedIncidents = useMemo(() => {
    if (!data?.incidents) return [];
    const items = [...data.incidents];
    const dir = sortDir === "asc" ? 1 : -1;

    items.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "incident_number":
          cmp = a.incident_number - b.incident_number;
          break;
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "service": {
          const sa = serviceMap.get(a.service_id) ?? "";
          const sb = serviceMap.get(b.service_id) ?? "";
          cmp = sa.localeCompare(sb);
          break;
        }
        case "status":
          cmp = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
          break;
        case "severity":
          cmp = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
          break;
        case "assignee": {
          const ua = (a.assigned_to && userMap.get(a.assigned_to)) || "";
          const ub = (b.assigned_to && userMap.get(b.assigned_to)) || "";
          cmp = ua.localeCompare(ub);
          break;
        }
        case "created_at":
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "updated_at":
          cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
      }
      return cmp * dir;
    });
    return items;
  }, [data?.incidents, sortKey, sortDir, serviceMap, userMap]);

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="ml-1">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>;
  };

  const sortableHead = (key: SortKey, label: string, className?: string) => (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className ?? ""}`}
      onClick={() => handleSort(key)}
    >
      {label}{sortIndicator(key)}
    </TableHead>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Incidents</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Status:</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]" data-testid="status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="triggered">Triggered</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading incidents...</p>}
      {error && (
        <p className="text-destructive">
          Failed to load incidents: {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            {data.total} incident{data.total !== 1 ? "s" : ""}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                {sortableHead("incident_number", "#", "w-[80px]")}
                {sortableHead("title", "Title")}
                {sortableHead("service", "Service", "w-[140px]")}
                {sortableHead("status", "Status", "w-[120px]")}
                {sortableHead("severity", "Severity", "w-[100px]")}
                {sortableHead("assignee", "Assignee", "w-[140px]")}
                {sortableHead("created_at", "Created", "w-[160px]")}
                {sortableHead("updated_at", "Last Update", "w-[160px]")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedIncidents.map((incident) => (
                <TableRow
                  key={incident.id}
                  data-testid="incident-row"
                  className={incident.status === "resolved" ? "bg-green-50 dark:bg-green-950/20" : ""}
                >
                  <TableCell className="font-mono">
                    {incident.incident_number}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/incidents/${incident.id}`}
                      className="hover:underline font-medium"
                      data-testid="incident-link"
                    >
                      {incident.title}
                    </Link>
                  </TableCell>
                  <TableCell data-testid="incident-service">
                    {serviceMap.get(incident.service_id) ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusClasses[incident.status]}
                      data-testid="incident-status"
                    >
                      {incident.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={severityClasses[incident.severity]}
                    >
                      {incident.severity}
                    </Badge>
                  </TableCell>
                  <TableCell data-testid="incident-assignee">
                    {incident.assigned_to
                      ? userMap.get(incident.assigned_to) ?? (
                          <span className="text-muted-foreground">—</span>
                        )
                      : <span className="text-muted-foreground">Unassigned</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(incident.created_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(incident.updated_at), {
                      addSuffix: true,
                    })}
                  </TableCell>
                </TableRow>
              ))}
              {sortedIncidents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No incidents found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
