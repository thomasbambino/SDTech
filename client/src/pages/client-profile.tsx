import { NavBar } from "@/components/nav-bar";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Phone, MapPin, Calendar } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EditClientDialog } from "@/components/edit-client-dialog";
import { CreateProjectDialog } from "@/components/create-project-dialog";

interface Project {
  id: number;
  title: string;
  description: string;
  status: string;
  createdAt: string;
}

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

export default function ClientProfile() {
  const { id } = useParams<{ id: string }>();

  // Fetch all clients first
  const { data: clients, isLoading: isLoadingClients, error: clientError } = useQuery<FreshbooksClient[]>({
    queryKey: ["/api/freshbooks/clients"],
  });

  // Find the specific client from the fetched clients
  const client = clients?.find(c => c.id === id);

  const { data: projects, isLoading: isLoadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/clients", id, "projects"],
  });

  if (isLoadingClients || isLoadingProjects) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (clientError || !client) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertDescription>
              {clientError instanceof Error ? clientError.message : "Failed to load client details"}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Client Details - Left Third */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-semibold">{client.name}</h2>
                    {client.organization && (
                      <p className="text-sm text-muted-foreground">{client.organization}</p>
                    )}
                  </div>
                  <EditClientDialog client={client} />
                </div>
                <div className="space-y-3">
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
                    <span>Client since: {client.createdDate}</span>
                  </div>
                  <div className="pt-2">
                    <Badge variant={client.status === 'Active' ? 'default' : 'secondary'}>
                      {client.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Projects - Right Two Thirds */}
          <div className="lg:col-span-2">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Projects</h2>
              <CreateProjectDialog clientId={client.id} />
            </div>

            <div className="space-y-4">
              {!projects?.length ? (
                <Alert>
                  <AlertDescription>
                    No projects found. Create a new project using the button above.
                  </AlertDescription>
                </Alert>
              ) : (
                projects.map((project) => (
                  <Card key={project.id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle>{project.title}</CardTitle>
                          <CardDescription>
                            Created {new Date(project.createdAt).toLocaleDateString()}
                          </CardDescription>
                        </div>
                        <Badge>{project.status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4">{project.description}</p>
                      <Button variant="outline" className="w-full" asChild>
                        <Link href={`/projects/${project.id}`}>View Details</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}