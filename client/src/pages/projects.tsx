import { NavBar } from "@/components/nav-bar";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Loader2, Calendar, DollarSign } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { useAuth } from "@/hooks/use-auth";

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
  progress?: number | null;
  freshbooksId?: string;
}

export default function Projects() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const endpoint = "/api/projects";  // Single endpoint that handles both types of projects

  const { data: projects, isLoading, error } = useQuery<Project[]>({
    queryKey: [endpoint],
    queryFn: async () => {
      const response = await fetch(endpoint, {
        credentials: 'include'
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!user // Only fetch when user is loaded
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertDescription>
              {error instanceof Error ? error.message : "Failed to load projects"}
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
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Projects</h1>
          {isAdmin && <CreateProjectDialog />}
        </div>

        {!projects?.length ? (
          <Alert>
            <AlertDescription>
              {isAdmin 
                ? "No projects found. Create a new project using the button above."
                : "No projects assigned to you yet."}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Card key={project.id} className="hover:shadow-md transition-shadow">
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
                  <p className="text-muted-foreground line-clamp-3 mb-4">
                    {project.description}
                  </p>
                  <div className="space-y-2 mb-4">
                    {project.dueDate && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4 mr-2" />
                        Due: {new Date(project.dueDate).toLocaleDateString()}
                      </div>
                    )}
                    {(project.budget || project.fixedPrice) && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <DollarSign className="h-4 w-4 mr-2" />
                        Budget: ${Number(project.budget || project.fixedPrice).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <Button variant="outline" className="w-full" asChild>
                    <Link href={`/projects/${project.id}`}>View Details</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}