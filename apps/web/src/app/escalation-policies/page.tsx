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

interface RuleDraft {
  escalation_delay_in_minutes: number;
  target_type: string;
  target_id: string;
}

export default function EscalationPoliciesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [numLoops, setNumLoops] = useState("1");
  const [rules, setRules] = useState<RuleDraft[]>([
    { escalation_delay_in_minutes: 5, target_type: "user", target_id: "" },
  ]);

  const { data, isLoading } = useQuery({
    queryKey: ["escalation-policies"],
    queryFn: () => api.listEscalationPolicies(),
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.listTeams(),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.listUsers(),
  });

  const { data: schedulesData } = useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.listSchedules(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createEscalationPolicy({
        name,
        team_id: teamId,
        num_loops: parseInt(numLoops, 10),
        rules: rules.filter((r) => r.target_id),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalation-policies"] });
      setOpen(false);
      setName("");
      setTeamId("");
      setNumLoops("1");
      setRules([{ escalation_delay_in_minutes: 5, target_type: "user", target_id: "" }]);
    },
  });

  const addRule = () => {
    setRules([...rules, { escalation_delay_in_minutes: 10, target_type: "user", target_id: "" }]);
  };

  const removeRule = (index: number) => {
    if (rules.length > 1) {
      setRules(rules.filter((_, i) => i !== index));
    }
  };

  const updateRule = (index: number, field: keyof RuleDraft, value: string | number) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "target_type") {
      updated[index].target_id = "";
    }
    setRules(updated);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Escalation Policies</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-policy-button">Create Policy</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Escalation Policy</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="space-y-4"
              data-testid="create-policy-form"
            >
              <div className="space-y-2">
                <Label htmlFor="policy-name">Name</Label>
                <Input
                  id="policy-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Platform Default"
                  data-testid="policy-name-input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Team</Label>
                  <Select value={teamId} onValueChange={setTeamId} required>
                    <SelectTrigger className="w-full" data-testid="policy-team-select">
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
                <div className="space-y-2">
                  <Label>Loops</Label>
                  <Input
                    type="number"
                    min={1}
                    max={9}
                    value={numLoops}
                    onChange={(e) => setNumLoops(e.target.value)}
                    data-testid="num-loops-input"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Rules</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addRule} data-testid="add-rule-button">
                    Add Rule
                  </Button>
                </div>
                {rules.map((rule, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2" data-testid="rule-editor">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">
                        Level {i}
                      </p>
                      {rules.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRule(i)}
                          className="text-xs h-6"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Delay (min)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={rule.escalation_delay_in_minutes}
                          onChange={(e) =>
                            updateRule(i, "escalation_delay_in_minutes", parseInt(e.target.value, 10) || 1)
                          }
                          data-testid="rule-delay-input"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Target Type</Label>
                        <Select
                          value={rule.target_type}
                          onValueChange={(v) => updateRule(i, "target_type", v)}
                        >
                          <SelectTrigger className="w-full" data-testid="rule-target-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="schedule">Schedule</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Target</Label>
                        <Select
                          value={rule.target_id}
                          onValueChange={(v) => updateRule(i, "target_id", v)}
                        >
                          <SelectTrigger className="w-full" data-testid="rule-target-select">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {rule.target_type === "user"
                              ? usersData?.users.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.name}
                                  </SelectItem>
                                ))
                              : schedulesData?.schedules.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                  </SelectItem>
                                ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="submit"
                disabled={createMutation.isPending || !teamId || !name || rules.every((r) => !r.target_id)}
                data-testid="submit-policy"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading policies...</p>}

      {data && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.escalation_policies.map((policy) => (
            <Link
              key={policy.id}
              href={`/escalation-policies/${policy.id}`}
              data-testid="policy-card"
            >
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg">{policy.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary">
                      {policy.rules.length} rule{policy.rules.length !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="outline">
                      {policy.services_count} service{policy.services_count !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="outline">
                      {policy.num_loops} loop{policy.num_loops !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {data.escalation_policies.length === 0 && (
            <p className="text-muted-foreground col-span-full text-center py-8">
              No escalation policies yet. Create one to get started.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
