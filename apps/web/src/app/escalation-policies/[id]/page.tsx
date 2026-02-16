"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface RuleDraft {
  escalation_delay_in_minutes: number;
  target_type: string;
  target_id: string;
}

export default function EscalationPolicyDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const policyId = params.id as string;

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editNumLoops, setEditNumLoops] = useState("1");
  const [editRules, setEditRules] = useState<RuleDraft[]>([]);
  const [linkServiceId, setLinkServiceId] = useState("");

  const { data: policy, isLoading } = useQuery({
    queryKey: ["escalation-policy", policyId],
    queryFn: () => api.getEscalationPolicy(policyId),
  });

  const { data: servicesData } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.listServices(),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.listUsers(),
  });

  const { data: schedulesData } = useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.listSchedules(),
  });

  // Populate edit form when policy loads or dialog opens
  useEffect(() => {
    if (policy && editOpen) {
      setEditName(policy.name);
      setEditDescription(policy.description || "");
      setEditNumLoops(String(policy.num_loops));
      setEditRules(
        policy.rules.map((r) => ({
          escalation_delay_in_minutes: r.escalation_delay_in_minutes,
          target_type: r.target_type,
          target_id: r.target_id,
        }))
      );
    }
  }, [policy, editOpen]);

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateEscalationPolicy(policyId, {
        name: editName,
        description: editDescription || undefined,
        num_loops: parseInt(editNumLoops, 10),
        rules: editRules.filter((r) => r.target_id),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalation-policy", policyId] });
      setEditOpen(false);
    },
  });

  const linkServiceMutation = useMutation({
    mutationFn: ({ serviceId, policyId }: { serviceId: string; policyId: string }) =>
      api.updateService(serviceId, { escalation_policy_id: policyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      setLinkServiceId("");
    },
  });

  const unlinkServiceMutation = useMutation({
    mutationFn: (serviceId: string) =>
      api.updateService(serviceId, { escalation_policy_id: "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });

  const addRule = () => {
    setEditRules([...editRules, { escalation_delay_in_minutes: 10, target_type: "user", target_id: "" }]);
  };

  const removeRule = (index: number) => {
    if (editRules.length > 1) {
      setEditRules(editRules.filter((_, i) => i !== index));
    }
  };

  const updateRule = (index: number, field: keyof RuleDraft, value: string | number) => {
    const updated = [...editRules];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "target_type") {
      updated[index].target_id = "";
    }
    setEditRules(updated);
  };

  if (isLoading) {
    return <p className="text-muted-foreground">Loading policy...</p>;
  }

  if (!policy) {
    return <p className="text-destructive">Policy not found</p>;
  }

  const linkedServices = servicesData?.services.filter(
    (s) => s.escalation_policy_id === policyId
  ) ?? [];

  const unlinkedServices = servicesData?.services.filter(
    (s) => !s.escalation_policy_id
  ) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="policy-name">
            {policy.name}
          </h1>
          {policy.description && (
            <p className="text-muted-foreground">{policy.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">
              {policy.num_loops} loop{policy.num_loops !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" data-testid="edit-policy-button">Edit</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Escalation Policy</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate();
              }}
              className="space-y-4"
              data-testid="edit-policy-form"
            >
              <div className="space-y-2">
                <Label htmlFor="edit-policy-name">Name</Label>
                <Input
                  id="edit-policy-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  data-testid="edit-policy-name-input"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-policy-desc">Description (optional)</Label>
                <Input
                  id="edit-policy-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  data-testid="edit-policy-description-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Loops</Label>
                <Input
                  type="number"
                  min={1}
                  max={9}
                  value={editNumLoops}
                  onChange={(e) => setEditNumLoops(e.target.value)}
                  data-testid="edit-num-loops-input"
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Rules</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addRule} data-testid="edit-add-rule-button">
                    Add Rule
                  </Button>
                </div>
                {editRules.map((rule, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2" data-testid="edit-rule-editor">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">
                        Level {i}
                      </p>
                      {editRules.length > 1 && (
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
                          data-testid="edit-rule-delay-input"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Target Type</Label>
                        <Select
                          value={rule.target_type}
                          onValueChange={(v) => updateRule(i, "target_type", v)}
                        >
                          <SelectTrigger className="w-full" data-testid="edit-rule-target-type">
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
                          <SelectTrigger className="w-full" data-testid="edit-rule-target-select">
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
                disabled={updateMutation.isPending || !editName || editRules.every((r) => !r.target_id)}
                data-testid="save-policy-button"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Escalation Chain */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Escalation Chain</CardTitle>
        </CardHeader>
        <CardContent>
          {policy.rules.length > 0 ? (
            <div className="space-y-3" data-testid="rules-chain">
              {policy.rules.map((rule, i) => (
                <div key={rule.id} data-testid="rule-item">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                      {i}
                    </div>
                    <div className="flex-1 p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={rule.target_type === "schedule" ? "default" : "secondary"}>
                            {rule.target_type}
                          </Badge>
                          <span className="font-medium text-sm">
                            {rule.target_name || rule.target_id}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {rule.escalation_delay_in_minutes} min delay
                        </span>
                      </div>
                    </div>
                  </div>
                  {i < policy.rules.length - 1 && (
                    <div className="ml-4 border-l-2 border-muted h-4" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No rules defined</p>
          )}
        </CardContent>
      </Card>

      {/* Linked Services */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Linked Services</CardTitle>
          {unlinkedServices.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={linkServiceId} onValueChange={setLinkServiceId}>
                <SelectTrigger className="w-[180px] h-8 text-xs" data-testid="link-service-select">
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {unlinkedServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!linkServiceId || linkServiceMutation.isPending}
                onClick={() => linkServiceMutation.mutate({ serviceId: linkServiceId, policyId: policyId })}
                data-testid="link-service-button"
              >
                Link
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {linkedServices.length > 0 ? (
            <div className="space-y-2" data-testid="linked-services">
              {linkedServices.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between p-2 border rounded text-sm"
                  data-testid="linked-service-item"
                >
                  <Link
                    href={`/services/${service.id}`}
                    className="hover:underline"
                  >
                    {service.name}
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-6"
                    onClick={() => unlinkServiceMutation.mutate(service.id)}
                    disabled={unlinkServiceMutation.isPending}
                    data-testid="unlink-service-button"
                  >
                    Unlink
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No services are using this policy yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
