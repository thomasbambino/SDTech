import { NavBar } from "@/components/nav-bar";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Phone, MapPin, Calendar } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FreshbooksConnect } from "@/components/freshbooks-connect";

interface FreshbooksClient {
  id: string;
  name: string;
  organization: string;
  email: string;
  phone: string;
  address: string;
  status: string;
  createdDate: string;
  updatedDate: string;
}

export default function ClientsPage() {
  const { data: clients, isLoading, error } = useQuery<FreshbooksClient[]>({
    queryKey: ["/api/freshbooks/clients"],
  });

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Freshbooks Clients</h1>

        <div className="mb-8">
          <FreshbooksConnect />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-[200px]">
            <Loader2 className="h-8 w-8 animate-spin text-border" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {error instanceof Error ? error.message : "Failed to load clients"}
            </AlertDescription>
          </Alert>
        ) : !clients?.length ? (
          <Alert>
            <AlertDescription>
              No clients found. Make sure you have connected your Freshbooks account and have active clients.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4">
            {clients.map((client) => (
              <Card key={client.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-xl font-semibold mb-1">{client.name}</h2>
                        {client.organization && (
                          <p className="text-sm text-muted-foreground">{client.organization}</p>
                        )}
                      </div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        {client.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            <span>{client.email}</span>
                          </div>
                        )}
                        {client.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <span>{client.phone}</span>
                          </div>
                        )}
                        {client.address && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            <span>{client.address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>Created: {client.createdDate}</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant={client.status === 'Active' ? 'default' : 'secondary'}>
                      {client.status}
                    </Badge>
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