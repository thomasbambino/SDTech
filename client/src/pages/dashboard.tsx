import { NavBar } from "@/components/nav-bar";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Project } from "@shared/schema";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { FileText, User, Phone, Mail, Building, Calendar, DollarSign } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { format } from "date-fns";

// Helper function to get days remaining
const getDaysRemaining = (dueDate: string) => {
  const due = new Date(dueDate);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

// Helper function to get progress status text
const getProgressStatus = (progress: number | null) => {
  if (!progress) return "Not Started";
  if (progress < 25) return "Initial Phase";
  if (progress < 50) return "In Progress";
  if (progress < 75) return "Advanced Stage";
  if (progress < 100) return "Final Stage";
  return "Completed";
};

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isCustomer = user?.role === 'customer';

  // Fetch Freshbooks client details if user is a customer
  const { data: clientDetails } = useQuery({
    queryKey: [`/api/freshbooks/clients/${user?.freshbooksId}`],
    enabled: !!user?.freshbooksId && isCustomer,
  });

  // Fetch projects with enhanced details
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    select: (data) => data.map(project => ({
      ...project,
      progressStatus: getProgressStatus(project.progress),
      daysRemaining: project.dueDate ? getDaysRemaining(project.dueDate) : null
    }))
  });

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">
          {isCustomer ? `Welcome back, ${clientDetails?.organization || user?.companyName}` : 'Dashboard'}
        </h1>

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
                  <span className="font-medium">
                    {clientDetails?.organization || user?.companyName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{clientDetails?.email || user?.email}</span>
                </div>
                {(clientDetails?.phone || user?.phoneNumber) && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{clientDetails?.phone || user?.phoneNumber}</span>
                  </div>
                )}
                {clientDetails?.address && (
                  <div className="flex items-start gap-2">
                    <Building className="h-4 w-4 text-muted-foreground mt-1" />
                    <span>{clientDetails.address}</span>
                  </div>
                )}
                {clientDetails?.createdDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Client since {clientDetails.createdDate}
                    </span>
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
                                {project.progressStatus}
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
                              {project.daysRemaining !== null && (
                                <span>
                                  {project.daysRemaining} days remaining
                                </span>
                              )}
                            </div>
                          </div>
                          {project.budget && (
                            <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                              <DollarSign className="h-4 w-4" />
                              <span>Budget: ${project.budget.toLocaleString()}</span>
                            </div>
                          )}
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