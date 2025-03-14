import { NavBar } from "@/components/nav-bar";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Phone, MapPin, Calendar } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreateClientDialog } from "@/components/create-client-dialog";
import { EditClientDialog } from "@/components/edit-client-dialog";
import { Link } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FreshbooksClient {
  id: string;
  name: string;
  organization: string;
  email: string;
  phone: string;
  address: string;
  status: string;
  createdDate: string;
}

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: clients, isLoading, error } = useQuery<FreshbooksClient[]>({
    queryKey: ["/api/freshbooks/clients"],
  });

  const filteredClients = clients?.filter(client => {
    const searchTermLower = searchTerm.toLowerCase();
    const matchesSearch = client.name.toLowerCase().includes(searchTermLower) ||
                         client.organization.toLowerCase().includes(searchTermLower) ||
                         client.email.toLowerCase().includes(searchTermLower) ||
                         client.phone.toLowerCase().includes(searchTermLower) ||
                         client.address.toLowerCase().includes(searchTermLower);

    const matchesStatus = statusFilter === "all" || client.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Clients</h1>
          <CreateClientDialog />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters Section */}
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-4">Filters</h2>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="search">Search</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Input
                              id="search"
                              placeholder="Search clients..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="max-w-xs">Search clients by their name, organization, email address, phone number, or address</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={statusFilter}
                      onValueChange={setStatusFilter}
                    >
                      <SelectTrigger id="status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Clients List */}
          <div className="lg:col-span-3">
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
            ) : !filteredClients?.length ? (
              <Alert>
                <AlertDescription>
                  No clients found. Create a new client using the button above.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid gap-4">
                {filteredClients.map((client) => (
                  <Card key={client.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <h2 className="text-xl font-semibold mb-1">{client.name}</h2>
                            <EditClientDialog client={client} />
                          </div>
                          {client.organization && (
                            <p className="text-sm text-muted-foreground">{client.organization}</p>
                          )}
                        </div>
                        <Badge variant={client.status === 'Active' ? 'default' : 'secondary'}>
                          {client.status}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-sm text-muted-foreground mb-4">
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
                      <Button asChild variant="outline" className="w-full">
                        <Link href={`/clients/${client.id}`}>
                          View Profile & Projects
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}