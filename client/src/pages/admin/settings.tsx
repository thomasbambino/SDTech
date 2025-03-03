import { NavBar } from "@/components/nav-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, X } from "lucide-react";

export default function AdminSettings() {
  const { toast } = useToast();
  
  const { data: freshbooksStatus, isLoading } = useQuery({
    queryKey: ["/api/freshbooks/connection-status"],
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/freshbooks/disconnect");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to disconnect from Freshbooks");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/freshbooks/connection-status"] });
      toast({
        title: "Success",
        description: "Disconnected from Freshbooks successfully",
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

  const connectToFreshbooks = async () => {
    try {
      const res = await apiRequest("GET", "/api/freshbooks/auth");
      if (!res.ok) {
        throw new Error("Failed to get Freshbooks authentication URL");
      }
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to connect to Freshbooks",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Admin Settings</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Freshbooks Integration</CardTitle>
            <CardDescription>
              Connect your Freshbooks account to enable client management and invoicing features.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>Status:</span>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : freshbooksStatus?.isConnected ? (
                  <div className="flex items-center gap-2 text-green-500">
                    <Check className="h-4 w-4" />
                    <span>Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-500">
                    <X className="h-4 w-4" />
                    <span>Not Connected</span>
                  </div>
                )}
              </div>
              
              {freshbooksStatus?.isConnected ? (
                <Button
                  variant="destructive"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Disconnecting...
                    </>
                  ) : (
                    'Disconnect'
                  )}
                </Button>
              ) : (
                <Button onClick={connectToFreshbooks}>
                  Connect to Freshbooks
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
