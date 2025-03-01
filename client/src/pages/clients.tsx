import { NavBar } from "@/components/nav-bar";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Phone, Building } from "lucide-react";

interface FreshbooksClient {
  id: string;
  email: string;
  organization: string;
  phoneNumber: string;
  status: string;
}

export default function ClientsPage() {
  const { data: clients, isLoading } = useQuery<FreshbooksClient[]>({
    queryKey: ["/api/freshbooks/clients"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Freshbooks Clients</h1>
        <div className="grid gap-4">
          {clients?.map((client) => (
            <Card key={client.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold mb-2">{client.organization}</h2>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        <span>{client.email}</span>
                      </div>
                      {client.phoneNumber && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          <span>{client.phoneNumber}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4" />
                        <span>{client.organization}</span>
                      </div>
                    </div>
                  </div>
                  <Badge>{client.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
