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
import Link from "next/link";
import { useState } from "react";

export default function SchedulesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");
  const [teamId, setTeamId] = useState("");
  const [layerName, setLayerName] = useState("Layer 1");
  const [rotationType, setRotationType] = useState("weekly");
  const [startDate, setStartDate] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.listSchedules(),
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.listTeams(),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.listUsers(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createSchedule({
        name,
        description: description || undefined,
        time_zone: timeZone,
        team_id: teamId,
        layers: selectedUsers.length > 0
          ? [
              {
                name: layerName,
                rotation_virtual_start: startDate
                  ? new Date(startDate).toISOString()
                  : new Date().toISOString(),
                rotation_turn_length_seconds:
                  rotationType === "daily" ? 86400 : 604800,
                users: selectedUsers.map((uid) => ({ user_id: uid })),
              },
            ]
          : [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      setOpen(false);
      setName("");
      setDescription("");
      setTimeZone("UTC");
      setTeamId("");
      setLayerName("Layer 1");
      setRotationType("weekly");
      setStartDate("");
      setSelectedUsers([]);
    },
  });

  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Schedules</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-schedule-button">Create Schedule</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Schedule</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="space-y-4"
              data-testid="create-schedule-form"
            >
              <div className="space-y-2">
                <Label htmlFor="sched-name">Name</Label>
                <Input
                  id="sched-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Primary On-Call Rotation"
                  data-testid="schedule-name-input"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sched-desc">Description (optional)</Label>
                <Input
                  id="sched-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this schedule covers"
                  data-testid="schedule-description-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value)}
                    placeholder="UTC"
                    data-testid="schedule-timezone-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Team</Label>
                  <Select value={teamId} onValueChange={setTeamId} required>
                    <SelectTrigger className="w-full" data-testid="schedule-team-select">
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamsData?.teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border rounded-lg p-3 space-y-3">
                <p className="text-sm font-medium">Rotation Layer</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Layer Name</Label>
                    <Input
                      value={layerName}
                      onChange={(e) => setLayerName(e.target.value)}
                      data-testid="layer-name-input"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Rotation</Label>
                    <Select value={rotationType} onValueChange={setRotationType}>
                      <SelectTrigger className="w-full" data-testid="rotation-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    data-testid="rotation-start-date"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Users (click to toggle)</Label>
                  <div className="flex flex-wrap gap-2" data-testid="user-multi-select">
                    {usersData?.users.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleUser(user.id)}
                        className={`px-2 py-1 text-xs rounded border transition-colors ${
                          selectedUsers.includes(user.id)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted"
                        }`}
                        data-testid="user-toggle"
                      >
                        {user.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Button
                type="submit"
                disabled={createMutation.isPending || !teamId || !name}
                data-testid="submit-schedule"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading schedules...</p>}

      {data && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.schedules.map((schedule) => (
            <Link
              key={schedule.id}
              href={`/schedules/${schedule.id}`}
              data-testid="schedule-card"
            >
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg">{schedule.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {schedule.time_zone}
                  </p>
                  <div className="flex items-center gap-2" data-testid="schedule-oncall">
                    <span className="text-sm text-muted-foreground">On-call:</span>
                    <Badge variant="outline">
                      {schedule.current_oncall_user_name || "No one"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {data.schedules.length === 0 && (
            <p className="text-muted-foreground col-span-full text-center py-8">
              No schedules yet. Create one to get started.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
