import { NavBar } from "@/components/nav-bar";
import { useQuery } from "@tanstack/react-query";
import { Project } from "@shared/schema";
import { useParams } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Upload } from "lucide-react";

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", id],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return <div>Project not found</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold">{project.title}</h1>
            <p className="text-muted-foreground">
              Created {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>
          <Badge>{project.status}</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Project Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{project.description}</p>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Files</CardTitle>
                <CardDescription>
                  Project documents and files
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </Button>
                
                <div className="mt-4">
                  {/* File list will go here */}
                  <p className="text-sm text-muted-foreground">No files uploaded yet</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
                <CardDescription>
                  Project notes and updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Notes section will go here */}
                <p className="text-sm text-muted-foreground">No notes added yet</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
