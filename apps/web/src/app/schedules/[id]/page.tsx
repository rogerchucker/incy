"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { format } from "date-fns";

interface LayerDraft {
  name: string;
  rotation_turn_length_seconds: number;
  rotation_virtual_start: string;
  users: string[]; // user IDs
}

export default function ScheduleDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const scheduleId = params.id as string;

  // Override dialog state
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideUser, setOverrideUser] = useState("");
  const [overrideStart, setOverrideStart] = useState("");
  const [overrideEnd, setOverrideEnd] = useState("");

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTimeZone, setEditTimeZone] = useState("UTC");
  const [editLayers, setEditLayers] = useState<LayerDraft[]>([]);

  const { data: schedule, isLoading } = useQuery({
    queryKey: ["schedule", scheduleId],
    queryFn: () => api.getSchedule(scheduleId),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.listUsers(),
  });

  // Populate edit form when schedule loads or dialog opens
  useEffect(() => {
    if (schedule && editOpen) {
      setEditName(schedule.name);
      setEditDescription(schedule.description || "");
      setEditTimeZone(schedule.time_zone);
      setEditLayers(
        schedule.layers.map((l) => ({
          name: l.name,
          rotation_turn_length_seconds: l.rotation_turn_length_seconds,
          rotation_virtual_start: l.rotation_virtual_start,
          users: l.users.map((u) => u.user_id),
        }))
      );
    }
  }, [schedule, editOpen]);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateSchedule(scheduleId, {
        name: editName,
        description: editDescription || undefined,
        time_zone: editTimeZone,
        layers: editLayers.map((l) => ({
          name: l.name,
          rotation_virtual_start: l.rotation_virtual_start,
          rotation_turn_length_seconds: l.rotation_turn_length_seconds,
          users: l.users.map((uid) => ({ user_id: uid })),
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule", scheduleId] });
      setEditOpen(false);
    },
  });

  const createOverrideMutation = useMutation({
    mutationFn: () =>
      api.createOverride(scheduleId, {
        user_id: overrideUser,
        start_time: new Date(overrideStart).toISOString(),
        end_time: new Date(overrideEnd).toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule", scheduleId] });
      setOverrideOpen(false);
      setOverrideUser("");
      setOverrideStart("");
      setOverrideEnd("");
    },
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: (overrideId: string) => api.deleteOverride(scheduleId, overrideId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule", scheduleId] });
    },
  });

  const addLayer = () => {
    setEditLayers([
      ...editLayers,
      {
        name: `Layer ${editLayers.length + 1}`,
        rotation_turn_length_seconds: 604800,
        rotation_virtual_start: new Date().toISOString(),
        users: [],
      },
    ]);
  };

  const removeLayer = (index: number) => {
    if (editLayers.length > 1) {
      setEditLayers(editLayers.filter((_, i) => i !== index));
    }
  };

  const toggleLayerUser = (layerIndex: number, userId: string) => {
    const updated = [...editLayers];
    const layer = { ...updated[layerIndex] };
    layer.users = layer.users.includes(userId)
      ? layer.users.filter((id) => id !== userId)
      : [...layer.users, userId];
    updated[layerIndex] = layer;
    setEditLayers(updated);
  };

  if (isLoading) {
    return <p className="text-muted-foreground">Loading schedule...</p>;
  }

  if (!schedule) {
    return <p className="text-destructive">Schedule not found</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="schedule-name">
            {schedule.name}
          </h1>
          {schedule.description && (
            <p className="text-muted-foreground">{schedule.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">{schedule.time_zone}</Badge>
          </div>
        </div>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" data-testid="edit-schedule-button">Edit</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Schedule</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate();
              }}
              className="space-y-4"
              data-testid="edit-schedule-form"
            >
              <div className="space-y-2">
                <Label htmlFor="edit-sched-name">Name</Label>
                <Input
                  id="edit-sched-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  data-testid="edit-schedule-name-input"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sched-desc">Description (optional)</Label>
                <Input
                  id="edit-sched-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  data-testid="edit-schedule-description-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Input
                  value={editTimeZone}
                  onChange={(e) => setEditTimeZone(e.target.value)}
                  data-testid="edit-schedule-timezone-input"
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Layers</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addLayer} data-testid="edit-add-layer-button">
                    Add Layer
                  </Button>
                </div>
                {editLayers.map((layer, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2" data-testid="edit-layer-editor">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">
                        Layer {i}
                      </p>
                      {editLayers.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLayer(i)}
                          className="text-xs h-6"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={layer.name}
                          onChange={(e) => {
                            const updated = [...editLayers];
                            updated[i] = { ...updated[i], name: e.target.value };
                            setEditLayers(updated);
                          }}
                          data-testid="edit-layer-name-input"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Rotation</Label>
                        <Select
                          value={String(layer.rotation_turn_length_seconds)}
                          onValueChange={(v) => {
                            const updated = [...editLayers];
                            updated[i] = { ...updated[i], rotation_turn_length_seconds: parseInt(v, 10) };
                            setEditLayers(updated);
                          }}
                        >
                          <SelectTrigger className="w-full" data-testid="edit-rotation-type-select">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="86400">Daily</SelectItem>
                            <SelectItem value="604800">Weekly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Users (click to toggle)</Label>
                      <div className="flex flex-wrap gap-2" data-testid="edit-user-multi-select">
                        {usersData?.users.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => toggleLayerUser(i, user.id)}
                            className={`px-2 py-1 text-xs rounded border transition-colors ${
                              layer.users.includes(user.id)
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border hover:bg-muted"
                            }`}
                            data-testid="edit-user-toggle"
                          >
                            {user.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="submit"
                disabled={updateMutation.isPending || !editName}
                data-testid="save-schedule-button"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Current On-Call */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Current On-Call</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2" data-testid="current-oncall">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="font-medium">
              {schedule.current_oncall_user_name || "No one on call"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Layers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Rotation Layers</CardTitle>
        </CardHeader>
        <CardContent>
          {schedule.layers.length > 0 ? (
            <div className="space-y-4" data-testid="layers-list">
              {schedule.layers.map((layer) => (
                <div key={layer.id} className="p-3 border rounded-lg" data-testid="layer-item">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-sm">{layer.name}</p>
                    <Badge variant="secondary" className="text-xs">
                      {layer.rotation_turn_length_seconds === 86400
                        ? "Daily"
                        : layer.rotation_turn_length_seconds === 604800
                          ? "Weekly"
                          : `${Math.round(layer.rotation_turn_length_seconds / 3600)}h`}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {layer.users.map((user) => (
                      <Badge key={user.id} variant="outline">
                        {user.user_name || user.user_id}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Started{" "}
                    {format(new Date(layer.rotation_virtual_start), "PPP")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No layers configured</p>
          )}
        </CardContent>
      </Card>

      {/* Overrides */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Overrides</CardTitle>
          <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="create-override-button">
                Add Override
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Override</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createOverrideMutation.mutate();
                }}
                className="space-y-4"
                data-testid="create-override-form"
              >
                <div className="space-y-2">
                  <Label>User</Label>
                  <Select value={overrideUser} onValueChange={setOverrideUser} required>
                    <SelectTrigger className="w-full" data-testid="override-user-select">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {usersData?.users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start</Label>
                    <Input
                      type="datetime-local"
                      value={overrideStart}
                      onChange={(e) => setOverrideStart(e.target.value)}
                      data-testid="override-start-input"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End</Label>
                    <Input
                      type="datetime-local"
                      value={overrideEnd}
                      onChange={(e) => setOverrideEnd(e.target.value)}
                      data-testid="override-end-input"
                      required
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={createOverrideMutation.isPending || !overrideUser}
                  data-testid="submit-override"
                >
                  {createOverrideMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {schedule.overrides.length > 0 ? (
            <div className="space-y-2" data-testid="overrides-list">
              {schedule.overrides.map((override) => (
                <div
                  key={override.id}
                  className="flex items-center justify-between p-2 border rounded text-sm"
                  data-testid="override-item"
                >
                  <div>
                    <span className="font-medium">
                      {override.user_name || override.user_id}
                    </span>
                    <span className="text-muted-foreground ml-2">
                      {format(new Date(override.start_time), "PP p")} -{" "}
                      {format(new Date(override.end_time), "PP p")}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteOverrideMutation.mutate(override.id)}
                    disabled={deleteOverrideMutation.isPending}
                    data-testid="delete-override-button"
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No active overrides</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
