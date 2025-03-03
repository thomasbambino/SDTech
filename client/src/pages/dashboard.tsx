import { NavBar } from "@/components/nav-bar";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Project } from "@shared/schema";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, Phone, Mail, Building } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreateProjectDialog } from "@/components/create-project-dialog";

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data: projects, isLoading, error } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const response = await fetch("/api/projects", {
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

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Client Profile</h1>
          <p className="text-muted-foreground">
            View and manage your account details and projects
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Client Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Client Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{user.companyName || 'Company not specified'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{user.email}</span>
                </div>
                {user.phoneNumber && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{user.phoneNumber}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Projects Section */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Projects</CardTitle>
                    <CardDescription>
                      View all your ongoing and completed projects
                    </CardDescription>
                  </div>
                  {isAdmin && <CreateProjectDialog />}
                </div>
              </CardHeader>
              <CardContent>
                {error && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>
                      {error instanceof Error ? error.message : "Failed to load projects"}
                    </AlertDescription>
                  </Alert>
                )}

                {!projects?.length ? (
                  <Alert>
                    <AlertDescription>
                      No projects found.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-4">
                    {projects.map((project) => (
                      <Card key={project.id} className="bg-muted/50">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-lg font-medium">{project.title}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant={project.status === 'Active' ? 'default' : 'secondary'}>
                                  {project.status}
                                </Badge>
                                {project.dueDate && (
                                  <div className="flex items-center text-sm text-muted-foreground">
                                    <Calendar className="h-4 w-4 mr-1" />
                                    Due: {new Date(project.dueDate).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            </div>
                            <Button variant="outline" asChild>
                              <Link href={`/projects/${project.id}`}>View Details</Link>
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <Progress value={project.progress || 0} />
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>{project.progress || 0}% Complete</span>
                              <span>{getStageFromProgress(project.progress || 0)}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to determine project stage based on progress
function getStageFromProgress(progress: number): string {
  if (progress === 100) return 'Completed';
  if (progress >= 90) return 'Final Review';
  if (progress >= 75) return 'Testing';
  if (progress >= 50) return 'Development';
  if (progress >= 25) return 'Design';
  if (progress > 0) return 'Planning';
  return 'Not Started';
}