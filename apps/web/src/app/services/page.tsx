"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default function ServicesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [teamId, setTeamId] = useState("");
  const [primaryOncall, setPrimaryOncall] = useState("");
  const [secondaryOncall, setSecondaryOncall] = useState("");
  const [escalationPolicyId, setEscalationPolicyId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.listServices(),
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.listTeams(),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.listUsers(),
  });

  const { data: policiesData } = useQuery({
    queryKey: ["escalation-policies"],
    queryFn: () => api.listEscalationPolicies(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createService({
        name,
        slug,
        team_id: teamId,
        primary_oncall_user_id: primaryOncall || undefined,
        secondary_oncall_user_id: secondaryOncall || undefined,
        escalation_policy_id: escalationPolicyId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      setOpen(false);
      setName("");
      setSlug("");
      setTeamId("");
      setPrimaryOncall("");
      setSecondaryOncall("");
      setEscalationPolicyId("");
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Services</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-service-button">Create Service</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Service</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="space-y-4"
              data-testid="create-service-form"
            >
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, "")
                    );
                  }}
                  placeholder="e.g. Payment API"
                  data-testid="service-name-input"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="e.g. payment-api"
                  data-testid="service-slug-input"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Team</Label>
                <Select value={teamId} onValueChange={setTeamId} required>
                  <SelectTrigger className="w-full" data-testid="team-select">
                    <SelectValue placeholder="Select a team" />
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
                <Label>Primary On-call (optional)</Label>
                <Select value={primaryOncall} onValueChange={setPrimaryOncall}>
                  <SelectTrigger className="w-full" data-testid="primary-oncall-select">
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
              <div className="space-y-2">
                <Label>Secondary On-call (optional)</Label>
                <Select value={secondaryOncall} onValueChange={setSecondaryOncall}>
                  <SelectTrigger className="w-full" data-testid="secondary-oncall-select">
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
              <div className="space-y-2">
                <Label>Escalation Policy (optional)</Label>
                <Select value={escalationPolicyId} onValueChange={setEscalationPolicyId}>
                  <SelectTrigger className="w-full" data-testid="escalation-policy-select">
                    <SelectValue placeholder="Select policy" />
                  </SelectTrigger>
                  <SelectContent>
                    {policiesData?.escalation_policies.map((policy) => (
                      <SelectItem key={policy.id} value={policy.id}>
                        {policy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={createMutation.isPending || !teamId}
                data-testid="submit-service"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading services...</p>}

      {data && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.services.map((service) => (
            <Link
              key={service.id}
              href={`/services/${service.id}`}
              data-testid="service-card"
            >
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg">{service.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground font-mono">
                    {service.slug}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
          {data.services.length === 0 && (
            <p className="text-muted-foreground col-span-full text-center py-8">
              No services yet. Create one to get started.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
