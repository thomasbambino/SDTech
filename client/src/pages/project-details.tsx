import { NavBar } from "@/components/nav-bar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Project, ProjectNote } from "@shared/schema";
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
import { Loader2, Calendar, DollarSign, Edit2, Save, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

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

// Helper function to safely format dates
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'Date not available';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleString();
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
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editedNoteContent, setEditedNoteContent] = useState("");
  const { user } = useAuth();

  // Fetch project details
  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", id],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error("Failed to fetch project");
      return response.json();
    }
  });

  // Fetch project notes
  const { data: notes } = useQuery<ProjectNote[]>({
    queryKey: ["/api/projects", id, "notes"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${id}/notes`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error("Failed to fetch notes");
      return response.json();
    },
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
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "notes"] });
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

  // Edit note mutation
  const editNoteMutation = useMutation({
    mutationFn: async ({ noteId, content }: { noteId: number; content: string }) => {
      const response = await fetch(`/api/projects/${id}/notes/${noteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ content })
      });
      if (!response.ok) throw new Error("Failed to update note");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "notes"] });
      setEditingNoteId(null);
      setEditedNoteContent("");
      toast({
        title: "Success",
        description: "Note updated successfully",
      });
    },
    onError: (error) => {
      console.error("Error updating note:", error);
      toast({
        title: "Error",
        description: "Failed to update note. Please try again.",
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleFileUpload = () => {
    if (selectedFile) {
      uploadFileMutation.mutate(selectedFile);
    }
  };

  const startEditing = (note: ProjectNote) => {
    setEditingNoteId(note.id);
    setEditedNoteContent(note.content);
  };

  const cancelEditing = () => {
    setEditingNoteId(null);
    setEditedNoteContent("");
  };

  const saveEdit = (noteId: number) => {
    if (editedNoteContent.trim()) {
      editNoteMutation.mutate({
        noteId,
        content: editedNoteContent.trim()
      });
    }
  };

  // Handle project stage change
  const handleStageChange = (stage: ProjectStage) => {
    const progress = PROJECT_STAGES[stage];
    updateProgressMutation.mutate(progress);
  };

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

  const currentStage = getStageFromProgress(project.progress || 0);

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold">{project.title}</h1>
            <p className="text-muted-foreground">
              Created {formatDate(project.createdAt)}
            </p>
          </div>
          <Badge>{project.status}</Badge>
        </div>

        {/* Progress Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Project Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
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
              <Progress value={project.progress || 0} className="mb-2" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{project.progress || 0}% Complete</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {/* Project Description */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Project Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{project.description}</p>
              </CardContent>
            </Card>

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
                          {editingNoteId === note.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editedNoteContent}
                                onChange={(e) => setEditedNoteContent(e.target.value)}
                                className="min-h-[100px]"
                              />
                              <div className="flex space-x-2">
                                <Button
                                  onClick={() => saveEdit(note.id)}
                                  disabled={editNoteMutation.isPending}
                                >
                                  {editNoteMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Save className="h-4 w-4 mr-2" />
                                      Save
                                    </>
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={cancelEditing}
                                >
                                  <X className="h-4 w-4 mr-2" />
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="whitespace-pre-wrap">{note.content}</p>
                              <div className="flex justify-between items-center mt-2 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <span>By {note.createdBy === user?.id ? 'You' : `User ${note.createdBy}`}</span>
                                  {note.createdBy === user?.id && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => startEditing(note)}
                                      className="h-6 w-6 p-0"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                                <span>{formatDate(note.createdAt)}</span>
                              </div>
                            </>
                          )}
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

            {/* Project Details Card */}
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {project.dueDate && (
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>Due: {formatDate(project.dueDate)}</span>
                  </div>
                )}
                {project.budget && (
                  <div className="flex items-center">
                    <DollarSign className="h-4 w-4 mr-2" />
                    <span>Budget: ${project.budget.toLocaleString()}</span>
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