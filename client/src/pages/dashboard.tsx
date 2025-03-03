import { NavBar } from "@/components/nav-bar";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Project } from "@shared/schema";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { FileText, User, Phone, Mail, Building, Calendar, DollarSign, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { CreateProjectDialog } from "@/components/create-project-dialog";

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

interface FreshbooksProject {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate?: string;
  budget?: number;
  fixedPrice?: string;
  createdAt: string;
  clientId: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  console.log('Current user:', {
    id: user?.id,
    role: user?.role,
    freshbooksId: user?.freshbooksId
  });

  // Fetch Freshbooks client data if user is a customer
  const { data: fbClient, isLoading: isLoadingClient, error: clientError } = useQuery<FreshbooksClient>({
    queryKey: ["/api/freshbooks/clients", user?.freshbooksId],
    queryFn: async () => {
      console.log('Fetching Freshbooks client data for ID:', user?.freshbooksId);
      const response = await fetch(`/api/freshbooks/clients/${user?.freshbooksId}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        const error = await response.json();
        console.error('Error fetching client data:', error);
        throw new Error(error.error || "Failed to fetch client details");
      }
      const data = await response.json();
      console.log('Received client data:', data);
      return data;
    },
    enabled: !isAdmin && !!user?.freshbooksId
  });

  // Fetch Freshbooks projects for the client
  const { data: fbProjects, isLoading: isLoadingProjects, error: projectsError } = useQuery<FreshbooksProject[]>({
    queryKey: ["/api/freshbooks/clients", user?.freshbooksId, "projects"],
    queryFn: async () => {
      console.log('Fetching Freshbooks projects for client ID:', user?.freshbooksId);
      const response = await fetch(`/api/freshbooks/clients/${user?.freshbooksId}/projects`, {
        credentials: 'include'
      });
      if (!response.ok) {
        const error = await response.json();
        console.error('Error fetching projects:', error);
        throw new Error(error.error || "Failed to fetch projects");
      }
      const data = await response.json();
      console.log('Received projects data:', data);
      return data;
    },
    enabled: !isAdmin && !!user?.freshbooksId
  });

  // Show loading state
  if (isLoadingClient || isLoadingProjects) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  // Show error state if any
  if (clientError || projectsError) {
    console.error('Dashboard errors:', { clientError, projectsError });
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Welcome, {fbClient?.organization || user?.companyName}</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{fbClient?.organization || user?.companyName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{fbClient?.email || user?.email}</span>
                </div>
                {(fbClient?.phone || user?.phoneNumber) && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{fbClient?.phone || user?.phoneNumber}</span>
                  </div>
                )}
                {fbClient?.address && (
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    <span>{fbClient.address}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Projects Section */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Your Projects
                </CardTitle>
                {isAdmin && <CreateProjectDialog />}
              </CardHeader>
              <CardContent>
                {!fbProjects?.length ? (
                  <p className="text-muted-foreground">No projects found.</p>
                ) : (
                  <div className="space-y-4">
                    {fbProjects.map((project) => (
                      <Card key={project.id} className="bg-muted/50">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="font-medium">{project.title}</h3>
                              <p className="text-sm text-muted-foreground">
                                {project.status}
                              </p>
                            </div>
                            <Button variant="outline" asChild size="sm">
                              <Link href={`/projects/${project.id}`}>View</Link>
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {project.dueDate && (
                              <div className="flex items-center text-sm text-muted-foreground">
                                <Calendar className="h-4 w-4 mr-2" />
                                Due: {new Date(project.dueDate).toLocaleDateString()}
                              </div>
                            )}
                            {project.fixedPrice && (
                              <div className="flex items-center text-sm text-muted-foreground">
                                <DollarSign className="h-4 w-4 mr-2" />
                                Budget: ${Number(project.fixedPrice).toLocaleString()}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                <Button className="w-full mt-4" asChild>
                  <Link href="/projects">View All Projects</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}