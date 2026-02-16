"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Incident } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useParams } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";

const statusClasses: Record<string, string> = {
  triggered: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  acknowledged: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  resolved: "bg-green-200 text-green-900 dark:bg-green-800/50 dark:text-green-300",
};

const severityOptions = ["critical", "warning", "info"] as const;

function parseTimelineDetails(details: string | null): Record<string, unknown> | null {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
}

export default function IncidentDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const incidentId = params.id as string;

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const { data: incident, isLoading } = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: () => api.getIncident(incidentId),
  });

  const { data: timeline } = useQuery({
    queryKey: ["timeline", incidentId],
    queryFn: () => api.getTimeline(incidentId),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["incident", incidentId] });
    queryClient.invalidateQueries({ queryKey: ["timeline", incidentId] });
    queryClient.invalidateQueries({ queryKey: ["incidents"] });
  };

  const ackMutation = useMutation({
    mutationFn: () => api.acknowledgeIncident(incidentId),
    onSuccess: invalidateAll,
  });

  const resolveMutation = useMutation({
    mutationFn: () => api.resolveIncident(incidentId),
    onSuccess: invalidateAll,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { title?: string; details?: string; severity?: string }) =>
      api.updateIncident(incidentId, data),
    onSuccess: invalidateAll,
  });

  const noteMutation = useMutation({
    mutationFn: (content: string) => api.addIncidentNote(incidentId, content),
    onSuccess: () => {
      setNoteContent("");
      invalidateAll();
    },
  });

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  if (isLoading) {
    return <p className="text-muted-foreground">Loading incident...</p>;
  }

  if (!incident) {
    return <p className="text-destructive">Incident not found</p>;
  }

  const startEditTitle = () => {
    setTitleDraft(incident.title);
    setEditingTitle(true);
  };

  const saveTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== incident.title) {
      updateMutation.mutate({ title: trimmed });
    }
  };

  const startEditDetails = () => {
    setDetailsDraft(incident.details || "");
    setEditingDetails(true);
  };

  const saveDetails = () => {
    setEditingDetails(false);
    if (detailsDraft !== (incident.details || "")) {
      updateMutation.mutate({ details: detailsDraft });
    }
  };

  const handleSeverityChange = (value: string) => {
    if (value !== incident.severity) {
      updateMutation.mutate({ severity: value });
    }
  };

  const handleAddNote = () => {
    const trimmed = noteContent.trim();
    if (trimmed) {
      noteMutation.mutate(trimmed);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {editingTitle ? (
              <Input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                size={Math.max(titleDraft.length + 1, 10)}
                className="text-2xl font-bold h-auto py-0 px-1 w-auto"
                data-testid="incident-title-input"
              />
            ) : (
              <h1
                className="text-2xl font-bold cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={startEditTitle}
                title="Click to edit"
                data-testid="incident-title"
              >
                {incident.title}
              </h1>
            )}
            <Badge
              variant="outline"
              className={statusClasses[incident.status]}
              data-testid="incident-status"
            >
              {incident.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Incident #{incident.incident_number} &middot; Created{" "}
            {formatDistanceToNow(new Date(incident.created_at), {
              addSuffix: true,
            })}
          </p>
        </div>
        <div className="flex gap-2">
          {incident.status === "triggered" && (
            <Button
              onClick={() => ackMutation.mutate()}
              disabled={ackMutation.isPending}
              data-testid="ack-button"
            >
              {ackMutation.isPending ? "Acknowledging..." : "Acknowledge"}
            </Button>
          )}
          {incident.status !== "resolved" && (
            <Button
              variant="outline"
              onClick={() => resolveMutation.mutate()}
              disabled={resolveMutation.isPending}
              data-testid="resolve-button"
            >
              {resolveMutation.isPending ? "Resolving..." : "Resolve"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Severity</span>
              <Select value={incident.severity} onValueChange={handleSeverityChange}>
                <SelectTrigger size="sm" data-testid="severity-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {severityOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Escalation Level</span>
              <span>L{incident.escalation_level}</span>
            </div>
            {incident.next_escalation_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Next Escalation</span>
                <span>
                  {formatDistanceToNow(new Date(incident.next_escalation_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service</span>
              <span>{incident.service_id}</span>
            </div>
            <div className="pt-2 border-t">
              <span className="text-muted-foreground text-xs">Description</span>
              {editingDetails ? (
                <Textarea
                  value={detailsDraft}
                  onChange={(e) => setDetailsDraft(e.target.value)}
                  onBlur={saveDetails}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingDetails(false);
                  }}
                  placeholder="Add a description..."
                  className="mt-1"
                  autoFocus
                  data-testid="incident-details-input"
                />
              ) : (
                <p
                  className="mt-1 cursor-pointer hover:text-muted-foreground transition-colors whitespace-pre-wrap"
                  onClick={startEditDetails}
                  title="Click to edit"
                  data-testid="incident-details"
                >
                  {incident.details || "No description. Click to add one."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Timestamps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{format(new Date(incident.created_at), "PPp")}</span>
            </div>
            {incident.acknowledged_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Acknowledged</span>
                <span>
                  {format(new Date(incident.acknowledged_at), "PPp")}
                </span>
              </div>
            )}
            {incident.resolved_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resolved</span>
                <span>{format(new Date(incident.resolved_at), "PPp")}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {timeline && timeline.entries.length > 0 ? (
            <div className="space-y-4" data-testid="timeline">
              {timeline.entries.map((entry) => {
                const parsed = parseTimelineDetails(entry.details);
                const isNote = entry.action === "note_added";
                const isUpdate = entry.action === "updated";

                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 text-sm"
                    data-testid="timeline-entry"
                  >
                    <div
                      className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                        isNote
                          ? "bg-blue-500"
                          : isUpdate
                          ? "bg-yellow-500"
                          : "bg-primary"
                      }`}
                    />
                    <div className="flex-1">
                      <p className="font-medium capitalize">
                        {isNote ? "Note" : entry.action.replace(/_/g, " ")}
                      </p>
                      {isNote && parsed && (
                        <p className="mt-1 text-foreground whitespace-pre-wrap" data-testid="timeline-note">
                          {(parsed as { content?: string }).content}
                        </p>
                      )}
                      {isUpdate && parsed && (
                        <div className="mt-1 text-muted-foreground">
                          {Object.entries(
                            (parsed as { changes?: Record<string, { from: string; to: string }> }).changes || {}
                          ).map(([field, change]) => (
                            <p key={field}>
                              Changed <span className="font-medium">{field}</span>{" "}
                              from &ldquo;{change.from || "(empty)"}&rdquo; to &ldquo;{change.to}&rdquo;
                            </p>
                          ))}
                        </div>
                      )}
                      <p className="text-muted-foreground">
                        {format(new Date(entry.created_at), "PPp")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No timeline entries</p>
          )}

          {/* Add Note */}
          <div className="mt-4 pt-4 border-t flex gap-2" data-testid="add-note-form">
            <Input
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Add a note..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAddNote();
                }
              }}
              data-testid="note-input"
            />
            <Button
              onClick={handleAddNote}
              disabled={!noteContent.trim() || noteMutation.isPending}
              data-testid="add-note-button"
            >
              {noteMutation.isPending ? "Adding..." : "Add Note"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
