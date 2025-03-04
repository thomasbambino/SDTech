import { NavBar } from "@/components/nav-bar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Phone, MapPin, Calendar, DollarSign, Key } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EditClientDialog } from "@/components/edit-client-dialog";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { EditProjectDialog } from "@/components/edit-project-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === 'admin';
  const isOwnProfile = user?.role === 'customer' && user.freshbooksId === id;

  // Password reset mutation for admin
  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/freshbooks/clients/${id}/reset-password`
      );
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Password Reset Email Sent",
        description: "A temporary password has been sent to the client's email.",
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

  // For admin users, fetch data from Freshbooks
  const { data: clientData, isLoading: isLoadingClient, error: clientError } = useQuery<FreshbooksClient>({
    queryKey: ["/api/freshbooks/clients", id],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch(`/api/freshbooks/clients/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error: ${response.status}`);
      }
      return response.json();
    }
  });

  // For customer users, use their own data
  const client = isOwnProfile ? {
    id: user.freshbooksId!,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
    organization: user.companyName || '',
    email: user.email,
    phone: user.phoneNumber || '',
    address: user.address || '',
    status: 'Active',
    createdDate: new Date(user.createdAt || '').toLocaleString()
  } : clientData;

  // Projects query based on user role
  const { data: projects, isLoading: isLoadingProjects, error: projectsError } = useQuery<Project[]>({
    queryKey: ["/api/freshbooks/clients", id, "projects"],
    enabled: !!client,
    queryFn: async () => {
      // Use different endpoints based on user role
      const endpoint = isAdmin 
        ? `/api/freshbooks/clients/${id}/projects`
        : `/api/projects?clientId=${id}`;

      const response = await fetch(endpoint);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error: ${response.status}`);
      }
      return response.json();
    }
  });

  if (isLoadingClient && isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (clientError && isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertDescription>
              {clientError instanceof Error ? clientError.message : `Unable to load client details`}
            </AlertDescription>
          </Alert>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/clients">Back to Clients</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertDescription>Client not found</AlertDescription>
          </Alert>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/clients">Back to Clients</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  <div className="flex gap-2">
                    {isAdmin && <EditClientDialog client={client} />}
                  </div>
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
                  {isAdmin && (
                    <Button
                      className="w-full mt-4"
                      variant="outline"
                      onClick={() => resetPasswordMutation.mutate()}
                      disabled={resetPasswordMutation.isPending}
                    >
                      <Key className="h-4 w-4 mr-2" />
                      Reset Client Password
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-2">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Projects</h2>
              {isAdmin && <CreateProjectDialog clientId={id} />}
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
                        <div className="flex items-center gap-2">
                          {isAdmin && <EditProjectDialog project={project} />}
                          <Badge variant={project.status === 'Active' ? 'default' : 'secondary'}>
                            {project.status}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4">
                        {project.description || 'No description provided'}
                      </p>
                      <div className="space-y-2 mb-4">
                        {project.dueDate && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4 mr-2" />
                            Due: {new Date(project.dueDate).toLocaleDateString()}
                          </div>
                        )}
                        {project.fixedPrice && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <DollarSign className="h-4 w-4 mr-2" />
                            Fixed Price: ${Number(project.fixedPrice).toLocaleString()}
                          </div>
                        )}
                        {project.budget && (
                          <div className="flex items-center text-sm text-muted-foreground">
                            <DollarSign className="h-4 w-4 mr-2" />
                            Budget: ${Number(project.budget).toLocaleString()}
                          </div>
                        )}
                      </div>
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