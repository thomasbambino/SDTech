import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export function FreshbooksConnect() {
  const { toast } = useToast();
  const [location] = useLocation();

  const { data: authData } = useQuery({
    queryKey: ["/api/freshbooks/auth"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/freshbooks/sync");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Sync Successful",
        description: "Your Freshbooks data has been synchronized.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Check if we just completed Freshbooks connection
  const params = new URLSearchParams(location.split("?")[1]);
  const freshbooksStatus = params.get("freshbooks");

  if (freshbooksStatus === "connected") {
    toast({
      title: "Freshbooks Connected",
      description: "Your Freshbooks account has been successfully connected.",
    });
  } else if (freshbooksStatus === "error") {
    toast({
      title: "Connection Failed",
      description: "Failed to connect to Freshbooks. Please try again.",
      variant: "destructive",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Freshbooks Integration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <Button asChild variant="outline">
            <Link href={authData?.authUrl}>
              Connect Freshbooks
            </Link>
          </Button>
          <Button 
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            Sync Now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
