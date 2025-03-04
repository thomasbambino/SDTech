import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export function FreshbooksConnect() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Query for auth URL and connection status
  const { data: authData, isLoading: isAuthLoading } = useQuery({
    queryKey: ["/api/freshbooks/auth"],
  });

  // Check connection status on mount and URL changes
  useEffect(() => {
    checkConnectionStatus();

    // Check URL parameters for connection status
    const params = new URLSearchParams(location.split("?")[1]);
    if (params.get("freshbooks") === "connected") {
      setIsConnected(true);
      toast({
        title: "Connected",
        description: "Successfully connected to Freshbooks with updated permissions.",
      });
    }
  }, [location, toast]);

  const checkConnectionStatus = async () => {
    try {
      const response = await fetch("/api/freshbooks/connection-status");
      const data = await response.json();
      setIsConnected(data.connected);
    } catch (error) {
      console.error("Error checking Freshbooks connection:", error);
      setIsConnected(false);
    }
  };

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/freshbooks/disconnect");
      return res.json();
    },
    onSuccess: () => {
      setIsConnected(false);
      queryClient.invalidateQueries({ queryKey: ["/api/freshbooks/auth"] });
      toast({
        title: "Disconnected",
        description: "Successfully disconnected from Freshbooks. Please reconnect to get the latest permissions.",
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

  const handleConnect = () => {
    if (!authData?.authUrl) return;

    setIsConnecting(true);
    window.location.href = authData.authUrl;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Freshbooks Integration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          {isAuthLoading ? (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </Button>
          ) : isConnected ? (
            <>
              <Button 
                onClick={() => disconnectMutation.mutate()}
                variant="outline"
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  'Disconnect Freshbooks'
                )}
              </Button>
              <Button 
                onClick={() => queryClient.invalidateQueries()}
                disabled={false}
              >
                Refresh Data
              </Button>
            </>
          ) : (
            <Button 
              onClick={handleConnect}
              variant="outline"
              disabled={isConnecting || !authData?.authUrl}
            >
              {isConnecting ? "Connecting..." : "Connect Freshbooks"}
            </Button>
          )}
        </div>
        {isConnected && (
          <Alert>
            <AlertDescription>
              ✓ Connected to Freshbooks
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}