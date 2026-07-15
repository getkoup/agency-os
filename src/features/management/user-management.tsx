"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { getFormString } from "~/lib/form-data";
import { api, type RouterOutputs } from "~/trpc/react";
import { type UserRole } from "~/lib/roles";

type UserRow = RouterOutputs["management"]["users"]["rows"][number];

function Memberships({
  options,
  selected,
  setSelected,
  disabled,
}: {
  options: Array<{ id: string; name: string }>;
  selected: string[];
  setSelected: (ids: string[]) => void;
  disabled: boolean;
}) {
  return (
    <div className="border-border/80 bg-secondary/25 grid max-h-44 gap-2 overflow-auto rounded-xl border p-3">
      {options.map((client) => (
        <Label key={client.id} className="flex items-center gap-2 font-normal">
          <Checkbox
            disabled={disabled}
            checked={selected.includes(client.id)}
            onCheckedChange={(checked) =>
              setSelected(
                checked
                  ? [...selected, client.id]
                  : selected.filter((id) => id !== client.id),
              )
            }
          />
          {client.name}
        </Label>
      ))}
    </div>
  );
}

export function UserManagement({
  rows,
  clients,
}: {
  rows: UserRow[];
  clients: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [role, setRole] = useState<UserRole>("client");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const create = api.management.createUser.useMutation({
    onSuccess: () => {
      setCreateOpen(false);
      setError(null);
      router.refresh();
    },
    onError: (value) => setError(value.message),
  });
  const update = api.management.updateUser.useMutation({
    onSuccess: () => {
      setEditing(null);
      setError(null);
      router.refresh();
    },
    onError: (value) => setError(value.message),
  });
  const reset = api.management.resetUserPassword.useMutation({
    onSuccess: () => {
      setResetting(null);
      setError(null);
    },
    onError: (value) => setError(value.message),
  });
  function roleSelect(value: string, onChange: (next: UserRole) => void) {
    return (
      <select
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
        value={value}
        onChange={(event) => onChange(event.target.value as UserRole)}
      >
        <option value="owner">Owner</option>
        <option value="admin">Admin</option>
        <option value="client">Client</option>
      </select>
    );
  }
  return (
    <>
      <div className="mb-4 flex justify-end px-5">
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            setRole("client");
            setSelected([]);
            setError(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="h-11 rounded-full px-5">Create user</Button>
          </DialogTrigger>
          <DialogContent className="shadow-sage-floating max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[1.25rem]">
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
              <DialogDescription>
                Set the initial password and access scope.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                create.mutate({
                  name: getFormString(data, "name"),
                  email: getFormString(data, "email"),
                  password: getFormString(data, "password"),
                  role,
                  clientIds: role === "client" ? selected : [],
                });
              }}
            >
              <Label>
                Name
                <Input
                  name="name"
                  className="mt-2 h-11 rounded-xl"
                  required
                  maxLength={255}
                />
              </Label>
              <Label>
                Email
                <Input
                  name="email"
                  className="mt-2 h-11 rounded-xl"
                  type="email"
                  required
                />
              </Label>
              <Label>
                Initial password
                <Input
                  name="password"
                  type="password"
                  className="mt-2 h-11 rounded-xl"
                  required
                  minLength={12}
                />
              </Label>
              <Label>Role</Label>
              {roleSelect(role, (next) => {
                setRole(next);
                if (next !== "client") setSelected([]);
              })}
              <Label>Client memberships</Label>
              <Memberships
                options={clients}
                selected={selected}
                setSelected={setSelected}
                disabled={role !== "client"}
              />
              {error ? (
                <p className="text-destructive text-sm">{error}</p>
              ) : null}
              <DialogFooter>
                <Button
                  className="h-11 sm:min-w-32"
                  type="submit"
                  disabled={create.isPending}
                >
                  {create.isPending ? "Creating…" : "Create user"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Clients</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="pl-6">
                  <div className="font-medium">{user.name ?? user.email}</div>
                  <div className="text-muted-foreground text-xs">
                    {user.email}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      user.status === "active" ? "secondary" : "destructive"
                    }
                    className="capitalize"
                  >
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.clients.length
                    ? user.clients.map((client) => (
                        <Badge
                          key={client.id}
                          className="mr-1"
                          variant="outline"
                        >
                          {client.name}
                        </Badge>
                      ))
                    : "—"}
                </TableCell>
                <TableCell className="space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(user);
                      setRole(user.role);
                      setSelected(user.clients.map(({ id }) => id));
                      setError(null);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setResetting(user);
                      setError(null);
                    }}
                  >
                    Reset password
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        {editing ? (
          <DialogContent className="shadow-sage-floating max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[1.25rem]">
            <DialogHeader>
              <DialogTitle>Edit {editing.name ?? editing.email}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                update.mutate({
                  userId: editing.id,
                  name: getFormString(data, "name"),
                  role,
                  status:
                    getFormString(data, "status") === "inactive"
                      ? "inactive"
                      : "active",
                  clientIds: role === "client" ? selected : [],
                });
              }}
            >
              <Label>
                Name
                <Input
                  name="name"
                  defaultValue={editing.name ?? editing.email}
                  className="mt-2 h-11 rounded-xl"
                  required
                />
              </Label>
              <Label>Role</Label>
              {roleSelect(role, (next) => {
                setRole(next);
                if (next !== "client") setSelected([]);
              })}
              <Label>
                Status
                <select
                  name="status"
                  defaultValue={editing.status}
                  className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 mt-2 h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:ring-[3px]"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Label>
              <Memberships
                options={clients}
                selected={selected}
                setSelected={setSelected}
                disabled={role !== "client"}
              />
              {error ? (
                <p className="text-destructive text-sm">{error}</p>
              ) : null}
              <DialogFooter>
                <Button
                  className="h-11 sm:min-w-32"
                  type="submit"
                  disabled={update.isPending}
                >
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
      <Dialog
        open={Boolean(resetting)}
        onOpenChange={(open) => {
          if (!open) setResetting(null);
        }}
      >
        {resetting ? (
          <DialogContent className="shadow-sage-floating max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[1.25rem]">
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                Set a new password for {resetting.email}.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                reset.mutate({
                  userId: resetting.id,
                  password: getFormString(data, "password"),
                });
              }}
            >
              <Label>
                New password
                <Input
                  name="password"
                  type="password"
                  className="mt-2 h-11 rounded-xl"
                  minLength={12}
                  required
                />
              </Label>
              {error ? (
                <p className="text-destructive text-sm">{error}</p>
              ) : null}
              <DialogFooter>
                <Button
                  className="h-11 sm:min-w-32"
                  type="submit"
                  disabled={reset.isPending}
                >
                  {reset.isPending ? "Resetting…" : "Reset password"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
