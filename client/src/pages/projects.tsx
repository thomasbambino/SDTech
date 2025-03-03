import { NavBar } from "@/components/nav-bar";
import { useQuery } from "@tanstack/react-query";
import { Project } from "@shared/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { CreateProjectDialog } from "@/components/create-project-dialog";

export default function Projects() {
  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Projects</h1>
          <CreateProjectDialog />
        </div>

        {isLoading ? (
          <div>Loading projects...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects?.map((project) => (
              <Card key={project.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{project.title}</CardTitle>
                      <CardDescription>
                        Created {" "}
                        {new Date(project.createdAt).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <Badge>{project.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground line-clamp-3 mb-4">
                    {project.description}
                  </p>
                  <Button variant="outline" asChild className="w-full">
                    <Link href={`/projects/${project.id}`}>
                      View Details
                    </Link>
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