import { NavBar } from "@/components/nav-bar";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Project } from "@shared/schema";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { FileText, User, Phone, Mail, Building } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { CreateProjectDialog } from "@/components/create-project-dialog";

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Welcome, {user?.companyName}</h1>

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
                  <span className="font-medium">{user?.companyName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{user?.email}</span>
                </div>
                {user?.phoneNumber && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{user?.phoneNumber}</span>
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
                {!projects?.length ? (
                  <p className="text-muted-foreground">No projects found.</p>
                ) : (
                  <div className="space-y-4">
                    {projects.map((project) => (
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
                            <Progress value={project.progress || 0} />
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>{project.progress || 0}% Complete</span>
                            </div>
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