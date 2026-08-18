"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { API_URL, getApiError } from "@/lib/api";
import { queryKeys, useAdminUsers, useCurrentUser, type AdminUser } from "@/lib/queries";
import InlineQueryError from "@/components/InlineQueryError";
import Button from "@/components/Button";

const API = API_URL;

const STATUS_ORDER = ["Saved", "Applied", "Interview", "Tech Test", "Offer", "Rejected", "Ghosted"] as const;

function AdminSkeleton() {
  return (
    <main className="min-h-screen bg-[#f5f2ed] px-4 py-6 font-mono text-[#1a1814] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl animate-pulse space-y-6">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded bg-[#d4cfc7]" />
          <div className="h-9 w-64 rounded bg-[#d4cfc7]" />
        </div>
        <div className="h-72 rounded-xl border border-[#d4cfc7] bg-[#edeae4]" />
      </div>
    </main>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const queryClient = useQueryClient();
  const [credits, setCredits] = useState(String(user.credits));

  const dirty = credits !== "" && Number(credits) !== user.credits;

  const mutation = useMutation({
    mutationFn: async (value: number) => {
      const response = await fetch(`${API}/admin/users/${user.id}/credits`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ credits: value }),
      });
      if (!response.ok) throw new Error(await getApiError(response, "Unable to update credits."));
      return response.json();
    },
    onSuccess: () => {
      toast.success(`Updated credits for ${user.email}.`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setCredits(String(user.credits));
    },
  });

  const handleSave = () => {
    const value = Number(credits);
    if (!Number.isInteger(value) || value < 0) {
      toast.error("Credits must be a whole number of 0 or more.");
      return;
    }
    mutation.mutate(value);
  };

  return (
    <tr className="border-b border-[#e1ddd6] last:border-0">
      <td className="px-4 py-3 align-top">
        <div className="text-sm">{user.name}</div>
        <div className="text-xs text-[#7a7570]">{user.email}</div>
        {user.is_admin && (
          <span className="mt-1 inline-block rounded-sm bg-[#e8f5c0] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#3d6600]">
            Admin
          </span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="text-sm">{user.tracker.total} tracked</div>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-[#7a7570]">
          {STATUS_ORDER.filter(status => user.tracker.by_status[status]).map(status => (
            <span key={status}>{status}: {user.tracker.by_status[status]}</span>
          ))}
          {user.tracker.total === 0 && <span>No applications yet</span>}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={1}
            value={credits}
            onChange={e => setCredits(e.target.value)}
            className="w-20 rounded-sm border border-[#d4cfc7] bg-[#e8e4dd] px-2 py-1 text-sm outline-none focus:border-[#8ab030]"
          />
          <Button onClick={handleSave} disabled={!dirty || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { data: currentUser, isLoading: userLoading, isError: userError } = useCurrentUser();
  const isAdmin = !!currentUser?.is_admin;
  const usersQuery = useAdminUsers(isAdmin);
  const users = usersQuery.data || [];

  useEffect(() => {
    if (userError) {
      router.push("/login");
    } else if (!userLoading && currentUser && !currentUser.is_admin) {
      router.push("/dashboard");
    }
  }, [userError, userLoading, currentUser, router]);

  if (userLoading || !isAdmin) return <AdminSkeleton />;

  return (
    <main className="min-h-screen bg-[#f5f2ed] px-4 py-6 font-mono text-[#1a1814] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <div className="text-[10px] tracking-[0.25em] text-[#7a7570] uppercase">Admin</div>
          <h1 className="text-3xl font-bold">Users</h1>
        </div>

        {usersQuery.isLoading && (
          <div className="h-72 animate-pulse rounded-xl border border-[#d4cfc7] bg-[#edeae4]" />
        )}

        {usersQuery.isError && (
          <InlineQueryError
            message="Unable to load users."
            onRetry={() => usersQuery.refetch()}
          />
        )}

        {usersQuery.isSuccess && (
          <div className="overflow-x-auto rounded-xl border border-[#d4cfc7] bg-[#fffdf9]">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-[#d4cfc7] text-[10px] uppercase tracking-[0.15em] text-[#7a7570]">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Tracked jobs</th>
                  <th className="px-4 py-3 font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => <UserRow key={user.id} user={user} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
