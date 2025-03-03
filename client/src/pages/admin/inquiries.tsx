import { useQuery, useMutation } from "@tanstack/react-query";
import { NavBar } from "@/components/nav-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Phone, Building } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PendingInquiry {
  id: number;
  username: string;
  email: string;
  phoneNumber?: string;
  companyName?: string;
  inquiryDetails?: string;
  createdAt: string;
}

export default function InquiriesPage() {
  const { toast } = useToast();
  const { data: inquiries, isLoading, error } = useQuery<PendingInquiry[]>({
    queryKey: ["/api/admin/inquiries"],
  });

  const importMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/inquiries/${id}/approve`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to import to Freshbooks");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inquiries"] });
      toast({
        title: "Success",
        description: "Client imported to Freshbooks successfully",
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

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Pending Inquiries</h1>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-[200px]">
            <Loader2 className="h-8 w-8 animate-spin text-border" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error instanceof Error ? error.message : "Failed to load inquiries"}
            </AlertDescription>
          </Alert>
        ) : !inquiries?.length ? (
          <Alert>
            <AlertDescription>
              No pending inquiries found.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4">
            {inquiries.map((inquiry) => (
              <Card key={inquiry.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-xl font-semibold mb-1">{inquiry.username}</h2>
                        {inquiry.companyName && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Building className="h-4 w-4" />
                            <span>{inquiry.companyName}</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          <span>{inquiry.email}</span>
                        </div>
                        {inquiry.phoneNumber && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <span>{inquiry.phoneNumber}</span>
                          </div>
                        )}
                      </div>
                      {inquiry.inquiryDetails && (
                        <div className="mt-4">
                          <h3 className="font-medium mb-2">Inquiry Details:</h3>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {inquiry.inquiryDetails}
                          </p>
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={() => importMutation.mutate(inquiry.id)}
                      disabled={importMutation.isPending}
                    >
                      {importMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        'Import to Freshbooks'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}