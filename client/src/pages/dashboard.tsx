import { NavBar } from "@/components/nav-bar";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Phone, MapPin, Calendar, DollarSign } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { Link } from "wouter";

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

interface Project {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate?: string;
  budget?: number;
  fixedPrice?: string;
  createdAt: string;
  clientId: string;
  billingMethod?: string;
  projectType?: string;
  billedAmount?: string;
  billedStatus?: string;
  services?: Array<{
    id: number;
    name: string;
    billable: boolean;
  }>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Fetch client details if user is a customer
  const { data: client, isLoading: isLoadingClient, error: clientError } = useQuery<FreshbooksClient>({
    queryKey: ["/api/freshbooks/clients", user?.freshbooksId],
    enabled: !!user?.freshbooksId && user?.role === 'customer'
  });

  // Fetch projects for the user
  const { data: projects, isLoading: isLoadingProjects, error: projectsError } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!user
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
                    <h2 className="text-2xl font-semibold">{client?.name || user?.companyName}</h2>
                    {client?.organization && (
                      <p className="text-sm text-muted-foreground">{client.organization}</p>
                    )}
                  </div>
                  {client && (
                    <Badge variant={client?.status === 'Active' ? 'default' : 'secondary'}>
                      {client?.status}
                    </Badge>
                  )}
                </div>
                <div className="space-y-3">
                  {(client?.email || user?.email) && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <span>{client?.email || user?.email}</span>
                    </div>
                  )}
                  {(client?.phone || user?.phoneNumber) && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      <span>{client?.phone || user?.phoneNumber}</span>
                    </div>
                  )}
                  {client?.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>{client.address}</span>
                    </div>
                  )}
                  {client?.createdDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>Client since: {client.createdDate}</span>
                    </div>
                  )}
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
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle>{project.title}</CardTitle>
                          <CardDescription>
                            Created {new Date(project.createdAt).toLocaleString()}
                          </CardDescription>
                        </div>
                        <Badge variant={project.status === 'Active' ? 'default' : 'secondary'}>
                          {project.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4">
                        {project.description || 'No description provided'}
                      </p>
                      <div className="space-y-2">
                        {project.dueDate && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4 mr-2" />
                            Due: {new Date(project.dueDate).toLocaleDateString()}
                          </div>
                        )}
                        {project.budget && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <DollarSign className="h-4 w-4 mr-2" />
                            Budget: ${project.budget.toLocaleString()}
                          </div>
                        )}
                      </div>
                      <Button variant="outline" className="w-full mt-4" asChild>
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