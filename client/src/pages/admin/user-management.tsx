import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { NavBar } from "@/components/nav-bar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function UserManagement() {
  const { toast } = useToast();
  const { user } = useAuth();

  // Redirect non-admin users
  if (user?.role !== "admin") {
    return <div>Access denied. Admin only.</div>;
  }

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users/admins"], // Updated endpoint to only fetch admin users
  });

  const roleUpdateMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/admins"] });
      toast({
        title: "Success",
        description: "User role updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const passwordResetMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/users/${userId}/reset-password`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Password Reset Successful",
        description: `Temporary password: ${data.tempPassword}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Admin Management</h1>
        <div className="grid gap-4">
          {users?.filter(u => u.role === 'admin').map((adminUser) => (
            <Card key={adminUser.id}>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <div className="font-semibold">{adminUser.username}</div>
                  <div className="text-sm text-muted-foreground mb-2">
                    {adminUser.companyName}
                  </div>
                  <Badge variant={adminUser.isTemporaryPassword ? "secondary" : "outline"}>
                    {adminUser.isTemporaryPassword ? "Temp Password" : "Active"}
                  </Badge>
                </div>
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    onClick={() => passwordResetMutation.mutate(adminUser.id)}
                    disabled={passwordResetMutation.isPending}
                  >
                    Reset Password
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}