import { NavBar } from "@/components/nav-bar";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Project } from "@shared/schema";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Mail, Phone, MapPin, Calendar, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Fetch client details if the user has a Freshbooks ID
  const { data: client, isLoading: isLoadingClient, error: clientError } = useQuery<FreshbooksClient>({
    queryKey: ["/api/freshbooks/clients", user?.freshbooksId],
    queryFn: async () => {
      const response = await fetch(`/api/freshbooks/clients/${user?.freshbooksId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!user?.freshbooksId,
  });

  // Fetch projects for the client
  const { data: projects, isLoading: isLoadingProjects, error: projectsError } = useQuery<Project[]>({
    queryKey: ["/api/freshbooks/clients", user?.freshbooksId, "projects"],
    queryFn: async () => {
      const response = await fetch(`/api/freshbooks/clients/${user?.freshbooksId}/projects`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!client
  });

  if (isLoadingClient) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (clientError) {
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
          {/* Client Profile Section */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-semibold">{client?.name}</h2>
                    {client?.organization && (
                      <p className="text-sm text-muted-foreground">{client.organization}</p>
                    )}
                  </div>
                  <Badge variant={client?.status === 'Active' ? 'default' : 'secondary'}>
                    {client?.status}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {client?.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <span>{client.email}</span>
                    </div>
                  )}
                  {client?.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  {client?.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>{client.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Client since: {client?.createdDate}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Projects Section */}
          <div className="lg:col-span-2">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Projects</h2>
              {isAdmin && <CreateProjectDialog clientId={client?.id} />}
            </div>
            <div className="space-y-4">
              {isLoadingProjects ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : projectsError ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {projectsError instanceof Error ? projectsError.message : "Failed to load projects"}
                  </AlertDescription>
                </Alert>
              ) : !projects?.length ? (
                <Alert>
                  <AlertDescription>
                    No projects found.
                  </AlertDescription>
                </Alert>
              ) : (
                projects.map((project) => (
                  <Card key={project.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-medium">{project.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {project.status}
                          </p>
                        </div>
                        <Button variant="outline" asChild size="sm">
                          <Link href={`/projects/${project.id}`}>View Details</Link>
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Progress value={project.progress || 0} />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>{project.progress || 0}% Complete</span>
                        </div>
                      </div>
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