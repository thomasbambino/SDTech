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
import { Loader2, Calendar, DollarSign, AlertTriangle, Trash2, Pencil, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
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
  due_date?: string;  // Snake case from API
  dueDate?: string;   // Camel case from transformations
  budget?: number;
  fixedPrice?: boolean | string;
  createdAt?: string;
  clientId: string;
  billingMethod?: string;
  projectType?: string;
  billedAmount?: number;
  billedStatus?: string;
  progress?: number;
  active?: boolean; // Added to handle status properly
  created_at?: string; // Added to handle createdAt consistently
}

// Helper function to safely format dates with better error handling and logging
const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) {
    console.log('No date string provided to formatDate');
    return 'Not set';  // Changed from 'Date not available'
  }
  try {
    console.log('Formatting date string:', dateString);
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.error('Invalid date string:', dateString);
      return 'Not set';  // Changed from 'Invalid date'
    }
    return date.toLocaleDateString();
  } catch (error) {
    console.error('Error formatting date:', error, 'Date string:', dateString);
    return 'Not set';  // Changed from 'Date error'
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
  const [localDueDate, setLocalDueDate] = useState<string | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isCustomer = user?.role === 'customer';
  const [isEditingFinancial, setIsEditingFinancial] = useState(false);
  const [budget, setBudget] = useState<number | undefined>(undefined);
  const [fixedPrice, setFixedPrice] = useState<number | undefined>(undefined);
  const [showBudget, setShowBudget] = useState(() => {
    try {
      const saved = localStorage.getItem(`project_budget_visible_${id}`);
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  // Effect to save budget visibility preference
  useEffect(() => {
    try {
      localStorage.setItem(`project_budget_visible_${id}`, JSON.stringify(showBudget));
    } catch (e) {
      console.error('Error saving budget visibility preference:', e);
    }
  }, [showBudget, id]);

  // Effect to initialize from localStorage when component mounts
  useEffect(() => {
    try {
      // Try to load from localStorage first
      const savedDate = localStorage.getItem(`project_due_date_${id}`);
      if (savedDate) {
        console.log('Loaded due date from localStorage:', savedDate);
        setLocalDueDate(savedDate);
      }
    } catch (e) {
      console.error('Error accessing localStorage:', e);
    }
  }, [id]);

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
        console.log('Raw API response:', data);

        // Extract project data from the correct location
        // The data might be in different structures
        const projectData = data.rawResponse?.project || data.project || data;

        console.log('Extracted project data:', projectData);

        // Extract due date directly from the project data
        const dueDateValue = projectData.due_date;
        console.log('Found due date value:', dueDateValue);

        // Transform the data to match our interface
        const transformedData = {
          ...projectData,
          id: projectData.id?.toString(),
          title: projectData.title,
          description: projectData.description || '',
          status: projectData.active ? 'Active' : 'Inactive',

          // Set both date properties
          due_date: dueDateValue,
          dueDate: dueDateValue,

          // Other properties...
          createdAt: projectData.created_at || projectData.createdAt,
          clientId: (projectData.client_id || projectData.clientId)?.toString(),
          // ... rest of the properties
          budget: projectData.budget,
          fixedPrice: projectData.fixedPrice,
          projectType: projectData.projectType,
          billedAmount: projectData.billedAmount,
          billedStatus: projectData.billedStatus,
          progress: projectData.progress
        };

        console.log('Final transformed data due_date:', transformedData.due_date);
        console.log('Final transformed data dueDate:', transformedData.dueDate);

        return transformedData;
      } catch (error) {
        console.error('Error fetching project:', error);
        throw error;
      }
    },
    staleTime: 60000 // 1 minute
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

  // Update due date mutation
  const updateDueDateMutation = useMutation({
    mutationFn: async (date: Date) => {
      // Format date as YYYY-MM-DD
      const formattedDate = date.toISOString().split('T')[0];

      console.log('Updating due date:', {
        projectId: id,
        date: formattedDate
      });

      const response = await fetch(`/api/freshbooks/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          project: {
            title: project?.title,
            description: project?.description || '',
            due_date: formattedDate,
            client_id: project?.clientId
          }
        }),
      });

      if (!response.ok) {
        console.error('Response status:', response.status);
        const errorData = await response.json();
        console.error('Error data:', errorData);
        throw new Error(errorData.details || errorData.error || 'Failed to update project');
      }

      const responseData = await response.json();
      console.log('Update response:', responseData);
      return responseData;
    },
    onSuccess: (responseData, dateVariable) => {
      // Format as YYYY-MM-DD
      const formattedDate = dateVariable.toISOString().split('T')[0];

      // Store in React state
      setLocalDueDate(formattedDate);

      // Also persist to localStorage
      try {
        localStorage.setItem(`project_due_date_${id}`, formattedDate);
        console.log('Saved due date to localStorage:', formattedDate);
      } catch (e) {
        console.error('Error saving to localStorage:', e);
      }

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
    staleTime: 30000, // 5 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });

  // Update financial mutation - UPDATED
  const updateFinancialMutation = useMutation({
    mutationFn: async () => {
      // Budget needs to be an integer (in cents)
      const budgetInCents = budget ? Math.round(budget * 100) : 0;

      // Fixed price should be a string formatted as a decimal
      const fixedPriceFormatted = fixedPrice ? fixedPrice.toFixed(2) : "0.00";

      console.log('Updating financial details:', {
        projectId: id,
        budget: budgetInCents,  // Integer value (cents)
        fixed_price: fixedPriceFormatted  // String value with 2 decimal places
      });

      const response = await fetch(`/api/freshbooks/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          project: {
            title: project?.title,
            description: project?.description || '',
            budget: budgetInCents,  // Integer in cents
            fixed_price: fixedPriceFormatted,  // String with 2 decimal places
            client_id: project?.clientId
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Financial update error response:', errorData);
        throw new Error(errorData.details || errorData.error || 'Failed to update project');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/freshbooks/clients", id, "projects", id]
      });
      setIsEditingFinancial(false);
      toast({
        title: "Success",
        description: "Financial details updated successfully",
      });
    },
    onError: (error) => {
      console.error("Error updating financial details:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update project",
        variant: "destructive",
      });
    }
  });

  // Update effect to initialize financial values
  useEffect(() => {
    if (project) {
      // Convert budget from cents to dollars for display
      setBudget(project.budget ? project.budget / 100 : 0);
      setFixedPrice(typeof project.fixedPrice === 'boolean' ? 0 :
        parseFloat(project.fixedPrice?.toString() || '0'));
    }
  }, [project]);

  const updateFinancialDetails = () => {
    updateFinancialMutation.mutate();
  };

  useEffect(() => {
    if (project) {
      setBudget(project.budget ? project.budget / 100 : 0);
      setFixedPrice(typeof project.fixedPrice === 'boolean' ? 0 : parseFloat(project.fixedPrice?.toString() || '0'));

    }
  }, [project]);

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


  console.log("Project data right before render:", {
    id: project.id,
    title: project.title,
    due_date: project.due_date,
    dueDate: project.dueDate,
    typeof_due_date: typeof project.due_date,
    typeof_dueDate: typeof project.dueDate,
    check: project.due_date || project.dueDate,
    typeof_check: typeof (project.due_date || project.dueDate)
  });

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold">{project.title}</h1>
          </div>
        </div>

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

        {/* Project Description */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Project Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{project.description || 'No description provided'}</p>
          </CardContent>
        </Card>

        {/* Project Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Project Timeline
                </CardTitle>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditingDueDate(true)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Created date */}
              <div className="text-sm">
                <span className="font-medium">Created:</span>{" "}
                {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "Not set"}
              </div>

              {/* Due date - completely rewritten */}
              <div className="text-sm flex items-center justify-between">
                <div>
                  <span className="font-medium">Due:</span>{" "}
                  {(() => {
                    console.log('Rendering due date, localDueDate:', localDueDate);
                    if (!localDueDate) return "Not set";
                    try {
                      return new Date(localDueDate).toLocaleDateString();
                    } catch (e) {
                      console.error('Error formatting localDueDate:', e);
                      return "Date error";
                    }
                  })()}
                </div>

                {/* Calendar popover for date selection */}
                {isEditingDueDate && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Calendar className="h-4 w-4 mr-2" />
                        Change Date
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <CalendarComponent
                        mode="single"
                        selected={localDueDate ? new Date(localDueDate) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            console.log("Date selected in calendar:", date);
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
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center">
                  <DollarSign className="h-5 w-5 mr-2" />
                  Financial Details
                </CardTitle>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setShowBudget(!showBudget)}
                        title={showBudget ? "Hide Budget" : "Show Budget"}
                      >
                        {showBudget ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setIsEditingFinancial(true)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm space-y-2">
                {isEditingFinancial ? (
                  <>
                    {showBudget && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Budget:</span>
                        <Input
                          type="number"
                          defaultValue={budget?.toString() || ""}
                          onChange={(e) => setBudget(parseFloat(e.target.value))}
                          className="w-32"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Fixed Price:</span>
                      <Input
                        type="number"
                        defaultValue={fixedPrice?.toString() || ""}
                        onChange={(e) => setFixedPrice(parseFloat(e.target.value))}
                        className="w-32"
                      />
                    </div>
                    <div className="space-x-2 mt-4">
                      <Button
                        size="sm"
                        onClick={() => updateFinancialMutation.mutate()}
                        disabled={updateFinancialMutation.isPending}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsEditingFinancial(false);
                          setBudget(project?.budget ? project.budget / 100 : 0);
                          setFixedPrice(typeof project.fixedPrice === 'boolean' ? 0 :
                            parseFloat(project.fixedPrice?.toString() || '0'));
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {showBudget && (
                      <div>
                        <span className="font-medium">Budget:</span>{" "}
                        ${budget ? (budget).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Fixed Price:</span>{" "}
                      ${fixedPrice ? fixedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                    </div>
                  </>
                )}
              </div>
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