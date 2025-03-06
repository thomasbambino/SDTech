import { NavBar } from "@/components/nav-bar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { EditNoteDialog } from "@/components/edit-note-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Calendar, DollarSign, AlertTriangle, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";

// Project stages with corresponding progress percentages
const PROJECT_STAGES = {
  "Not Started": 0,
  "Requirements Gathering": 10,
  "Design Phase": 25,
  "Development - Initial": 40,
  "Development - Advanced": 60,
  "Testing": 75,
  "Client Review": 85,
  "Final Adjustments": 95,
  "Completed": 100
} as const;

type ProjectStage = keyof typeof PROJECT_STAGES;

interface ProjectNote {
  id: number;
  projectId: number;
  content: string;
  createdAt: string;
  createdBy: number;
  updatedAt?: string;
}

interface FreshbooksProject {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate?: string;
  budget?: number;
  fixedPrice?: boolean | string;
  createdAt?: string;
  clientId: string;
  billingMethod?: string;
  projectType?: string;
  billedAmount?: number;
  billedStatus?: string;
  progress?: number;
}

// Helper function to safely format dates
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'Date not available';
  try {
    return new Date(dateString).toLocaleString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Date not available';
  }
};

// Helper function to get stage from progress
const getStageFromProgress = (progress: number): ProjectStage => {
  const stages = Object.entries(PROJECT_STAGES);
  for (let i = stages.length - 1; i >= 0; i--) {
    if (progress >= stages[i][1]) {
      return stages[i][0] as ProjectStage;
    }
  }
  return "Not Started";
};

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [newNote, setNewNote] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isCustomer = user?.role === 'customer';

  // Fetch project details
  const {
    data: project,
    isLoading: projectLoading,
    error: projectError
  } = useQuery<FreshbooksProject>({
    queryKey: ["/api/freshbooks/clients", id, "projects", id],
    queryFn: async () => {
      try {
        console.log('Fetching project details for ID:', id);

        const response = await fetch(`/api/freshbooks/clients/${id}/projects/${id}`, {
          credentials: 'include',
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
          const contentType = response.headers.get('content-type');

          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error: ${response.status}`);
          } else {
            throw new Error(`Server error: ${response.status}`);
          }
        }

        const data = await response.json();
        console.log('Received project data:', data);
        return data;
      } catch (error) {
        console.error('Error fetching project:', error);
        throw error;
      }
    },
    retry: 1
  });

  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(`/api/projects/${id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ content })
      });
      if (!response.ok) throw new Error("Failed to add note");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", id, "notes"],
        refetchType: 'all'
      });
      setNewNote("");
      toast({
        title: "Success",
        description: "Note added successfully",
      });
    },
    onError: (error) => {
      console.error("Error adding note:", error);
      toast({
        title: "Error",
        description: "Failed to add note. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update progress mutation
  const updateProgressMutation = useMutation({
    mutationFn: async (progress: number) => {
      const response = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ progress })
      });
      if (!response.ok) throw new Error("Failed to update progress");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      toast({
        title: "Success",
        description: "Project progress updated",
      });
    },
    onError: (error) => {
      console.error("Error updating progress:", error);
      toast({
        title: "Error",
        description: "Failed to update progress. Please try again.",
        variant: "destructive",
      });
    },
  });

  // File upload mutation
  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/projects/${id}/documents`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) throw new Error("Failed to upload file");
      return response.json();
    },
    onSuccess: () => {
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      toast({
        title: "Success",
        description: "File uploaded successfully",
      });
    },
    onError: (error) => {
      console.error("Error uploading file:", error);
      toast({
        title: "Error",
        description: "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Add due date update mutation
  const updateDueDateMutation = useMutation({
    mutationFn: async (date: Date) => {
      // Format date as YYYY-MM-DD
      const formattedDate = date.toISOString().split('T')[0];

      console.log('Updating due date:', {
        projectId: id,
        date: formattedDate
      });

      // Create a request that exactly mimics what EditProjectDialog does
      // Include only the necessary project data
      const response = await fetch(`/api/freshbooks/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          project: {
            title: project.title,
            description: project.description || '',
            due_date: formattedDate,
            client_id: project.clientId
            // Omit fixed_price and budget to avoid validation errors
          }
        }),
      });

      if (!response.ok) {
        console.error('Response status:', response.status);
        const errorData = await response.json();
        console.error('Error data:', errorData);
        throw new Error(errorData.details || errorData.error || 'Failed to update project');
      }

      return response.json();
    },
    onSuccess: () => {
      // Follow the exact pattern from EditProjectDialog
      queryClient.invalidateQueries({ queryKey: ['/api/freshbooks/projects'] });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/freshbooks/clients', project.clientId, 'projects']
      });

      // Also invalidate the specific query used in this component
      queryClient.invalidateQueries({
        queryKey: ['/api/freshbooks/clients', id, 'projects', id]
      });

      toast({
        title: "Success",
        description: "Due date updated successfully",
      });
      setIsEditingDueDate(false);
    },
    onError: (error) => {
      console.error("Error updating due date:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update project",
        variant: "destructive",
      });
    }
  });


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleFileUpload = () => {
    if (selectedFile) {
      uploadFileMutation.mutate(selectedFile);
    }
  };

  // Handle project stage change
  const handleStageChange = (stage: ProjectStage) => {
    const progress = PROJECT_STAGES[stage];
    updateProgressMutation.mutate(progress);
  };

  // Fetch project notes with shorter stale time
  const { data: notes, isLoading: notesLoading, error: notesError } = useQuery<ProjectNote[]>({
    queryKey: ["/api/projects", id, "notes"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${id}/notes`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error("Failed to fetch notes");
      return response.json();
    },
    staleTime: 0, // Always fetch fresh data
    refetchOnMount: true // Refetch when component mounts
  });


  if (projectLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (projectError) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4 mr-2" />
            <AlertDescription>
              <div className="font-semibold">Error loading project:</div>
              <div className="mt-1">
                {projectError instanceof Error ? projectError.message : `Failed to load project details`}
              </div>
              <div className="mt-2 text-sm">
                This could be due to a server error or an issue with the project ID.
              </div>
            </AlertDescription>
          </Alert>
          <div className="mt-6 space-y-2">
            <p className="text-sm text-muted-foreground">
              You can try:
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>Refreshing the page</li>
              <li>Checking if the project ID ({id}) is correct</li>
              <li>Making sure you are logged in with the correct account</li>
            </ul>
          </div>
          <div className="mt-6 flex gap-4">
            <Button variant="default" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
            <Button variant="outline" asChild>
              <Link href="/projects">Back to Projects</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4 mr-2" />
            <AlertDescription>Project not found</AlertDescription>
          </Alert>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/projects">Back to Projects</Link>
          </Button>
        </div>
      </div>
    );
  }

  const currentStage = getStageFromProgress(project.progress || 0);
  const isFixedPrice = typeof project.fixedPrice === 'boolean' ? project.fixedPrice : project.fixedPrice === 'Yes';

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold">{project.title}</h1>
            <p className="text-muted-foreground">
              Created {formatDate(project.createdAt?.toString())}
            </p>
          </div>
          <Badge variant={project.status === 'Active' || project.status === 'active' ? 'default' : 'secondary'}>
            {project.status}
          </Badge>
        </div>

        {/* Project Description */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Project Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{project.description || 'No description provided'}</p>
          </CardContent>
        </Card>

        {/* Progress Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Project Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {isAdmin && (
                  <div className="w-64">
                    <Select
                      value={currentStage}
                      onValueChange={(value) => handleStageChange(value as ProjectStage)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select project stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PROJECT_STAGES).map(([stage, progress]) => (
                          <SelectItem key={stage} value={stage}>
                            {stage} ({progress}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <Progress value={project.progress || 0} />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{project.progress || 0}% Complete</span>
                    <span>{currentStage}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Dates
                </CardTitle>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditingDueDate(true)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm">
                <span className="font-medium">Created:</span>{" "}
                {formatDate(project.createdAt?.toString())}
              </div>
              <div className="text-sm flex items-center justify-between">
                <div>
                  <span className="font-medium">Due:</span>{" "}
                  {project.dueDate ? formatDate(project.dueDate) : "Not set"}
                </div>
                {isEditingDueDate && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Calendar className="h-4 w-4 mr-2" />
                        Select Date
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <CalendarComponent
                        mode="single"
                        selected={project.dueDate ? new Date(project.dueDate) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            updateDueDateMutation.mutate(date);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="h-5 w-5 mr-2" />
                Financial Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {project.budget && (
                <div className="text-sm">
                  <span className="font-medium">Budget:</span>{" "}
                  ${Number(project.budget).toLocaleString()}
                </div>
              )}
              {project.billedAmount && (
                <div className="text-sm">
                  <span className="font-medium">Billed:</span>{" "}
                  ${Number(project.billedAmount).toLocaleString()}
                </div>
              )}
              {project.fixedPrice !== undefined && (
                <div className="text-sm">
                  <span className="font-medium">Fixed Price:</span>{" "}
                  <Badge variant={isFixedPrice ? "default" : "secondary"}>
                    {isFixedPrice ? "Yes" : "No"}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                Project Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {project.billingMethod && (
                <div className="text-sm">
                  <span className="font-medium">Billing Method:</span>{" "}
                  {project.billingMethod}
                </div>
              )}
              {project.projectType && (
                <div className="text-sm">
                  <span className="font-medium">Type:</span>{" "}
                  {project.projectType}
                </div>
              )}
              {project.billedStatus && (
                <div className="text-sm">
                  <span className="font-medium">Status:</span>{" "}
                  <Badge>{project.billedStatus}</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {/* Notes Section */}
            <Card>
              <CardHeader>
                <CardTitle>Project Notes</CardTitle>
                <CardDescription>
                  Add notes and updates about the project
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Add a new note..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                    />
                    <Button
                      onClick={() => addNoteMutation.mutate(newNote)}
                      disabled={!newNote.trim() || addNoteMutation.isPending}
                    >
                      {addNoteMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        "Add Note"
                      )}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {notes?.map((note) => (
                      <Card key={note.id}>
                        <CardContent className="pt-6">
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                              <p className="whitespace-pre-wrap mb-2">{note.content}</p>
                              <div className="flex items-center text-sm text-muted-foreground">
                                <span>By {note.createdBy === user?.id ? 'You' : `User ${note.createdBy}`}</span>
                                <span className="mx-2">•</span>
                                <span>{formatDate(note.createdAt)}</span>
                              </div>
                            </div>
                            {note.createdBy === user?.id && (
                              <EditNoteDialog projectId={id} note={note} />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            {/* File Upload Section */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Files</CardTitle>
                <CardDescription>
                  Project documents and files
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Input
                      type="file"
                      onChange={handleFileChange}
                      className="mb-2"
                    />
                    <Button
                      className="w-full"
                      onClick={handleFileUpload}
                      disabled={!selectedFile || uploadFileMutation.isPending}
                    >
                      {uploadFileMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        "Upload File"
                      )}
                    </Button>
                  </div>

                  {/* File list will be implemented in the next iteration */}
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground">No files uploaded yet</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}