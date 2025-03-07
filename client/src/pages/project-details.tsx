import { NavBar } from "@/components/nav-bar";
import { useQuery, useMutation, UseMutationResult } from "@tanstack/react-query";
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
import { useState, useEffect, useCallback } from "react";
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

// Add the custom hook at the top of your component
const useProjectCache = (projectId: string) => {
  // Initialize cache from localStorage
  const [cachedProject, setCachedProject] = useState<FreshbooksProject | null>(() => {
    try {
      const saved = localStorage.getItem(`project_data_${projectId}`);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error('Error reading from localStorage:', e);
      return null;
    }
  });

  // Function to update cache
  const updateCache = useCallback((newData: Partial<FreshbooksProject>) => {
    setCachedProject(prevData => {
      if (!prevData) return newData as FreshbooksProject;
      const merged = { ...prevData, ...newData };
      try {
        localStorage.setItem(`project_data_${projectId}`, JSON.stringify(merged));
      } catch (e) {
        console.error('Error saving to localStorage:', e);
      }
      return merged;
    });
  }, [projectId]);

  // Add progress to localStorage
  const updateProgressInLocalStorage = useCallback((progress: number) => {
    try {
      localStorage.setItem(`project_progress_${projectId}`, progress.toString());
    } catch (e) {
      console.error('Error saving progress to localStorage:', e);
    }
  }, [projectId]);

  return { cachedProject, updateCache, updateProgressInLocalStorage };
};

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const { cachedProject, updateCache, updateProgressInLocalStorage } = useProjectCache(id);
  const { toast } = useToast();
  const [newNote, setNewNote] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);
  const [localDueDate, setLocalDueDate] = useState<string | null>(() => {
    try {
      const savedDate = localStorage.getItem(`project_due_date_${id}`);
      if (savedDate) {
        console.log('Loaded due date from localStorage:', savedDate);
        return savedDate;
      }
      // Fallback to cached project data if available
      if (cachedProject?.due_date) {
        return cachedProject.due_date;
      }
    } catch (e) {
      console.error('Error accessing localStorage:', e);
    }
    return null;
  });
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isCustomer = user?.role === 'customer';
  const [isEditingFinancial, setIsEditingFinancial] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [budget, setBudget] = useState<number | undefined>(() => {
    try {
      const savedBudget = localStorage.getItem(`project_budget_${id}`);
      if (savedBudget) {
        console.log('Loaded budget from localStorage:', savedBudget);
        return parseFloat(savedBudget);
      }
      // Fallback to cached project data if available
      if (cachedProject?.budget) {
        return cachedProject.budget / 100; // Convert from cents to dollars
      }
    } catch (e) {
      console.error('Error accessing localStorage for budget:', e);
    }
    return undefined;
  });
  const [fixedPrice, setFixedPrice] = useState<number | undefined>(() => {
    try {
      const savedFixedPrice = localStorage.getItem(`project_fixed_price_${id}`);
      if (savedFixedPrice) {
        console.log('Loaded fixed price from localStorage:', savedFixedPrice);
        return parseFloat(savedFixedPrice);
      }
      // Fallback to cached project data if available
      if (cachedProject?.fixedPrice) {
        return typeof cachedProject.fixedPrice === 'boolean' ? 0 :
          parseFloat(cachedProject.fixedPrice.toString() || '0');
      }
    } catch (e) {
      console.error('Error accessing localStorage for fixed price:', e);
    }
    return undefined;
  });
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

  // Update your project query to use and update the cache
  const {
    data: project,
    isLoading: projectLoading,
    error: projectError
  } = useQuery<FreshbooksProject>({
    queryKey: ["/api/freshbooks/clients", id, "projects", id],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/freshbooks/clients/${id}/projects/${id}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          if (cachedProject) return cachedProject; // Return cached data if available
          throw new Error('API error');
        }

        const data = await response.json();
        const projectData = data.rawResponse?.project || data.project || data;

        // Transform your data as usual
        const transformedData = {
          ...projectData,
          id: projectData.id?.toString(),
          title: projectData.title,
          description: projectData.description || '',
          status: projectData.active ? 'Active' : 'Inactive',
          due_date: projectData.due_date,
          dueDate: projectData.due_date,
          createdAt: projectData.created_at || projectData.createdAt,
          clientId: (projectData.client_id || projectData.clientId)?.toString(),
          budget: projectData.budget,
          fixedPrice: projectData.fixedPrice,
          projectType: projectData.projectType,
          billedAmount: projectData.billedAmount,
          billedStatus: projectData.billedStatus,
          progress: projectData.progress !== undefined ?
            projectData.progress : cachedProject?.progress
        };

        // Update the cache with fresh data
        updateCache(transformedData);
        return transformedData;
      } catch (error) {
        if (cachedProject) return cachedProject; // Fallback to cache on error
        throw error;
      }
    },
    staleTime: 60000
  });

  // Effect to initialize form values when project data is available
  useEffect(() => {
    if (project) {
      // Set title and description directly from project
      setEditedTitle(project.title);
      setEditedDescription(project.description || '');

      // For budget and fixed price, only set from project if not already in localStorage
      if (!localStorage.getItem(`project_budget_${id}`)) {
        setBudget(project.budget ? project.budget / 100 : 0);
      }

      if (!localStorage.getItem(`project_fixed_price_${id}`)) {
        setFixedPrice(typeof project.fixedPrice === 'boolean' ? 0 :
          parseFloat(project.fixedPrice?.toString() || '0'));
      }

      // For due date (which we're already handling)
      if (!localStorage.getItem(`project_due_date_${id}`) && (project.due_date || project.dueDate)) {
        setLocalDueDate(project.due_date || project.dueDate || null);
      }
    }
  }, [project, id]);


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
      // Update cache first for immediate UI feedback
      updateCache({ progress });
      updateProgressInLocalStorage(progress); //Update localStorage

      console.log('Updating project progress:', {
        projectId: id,
        progress: progress
      });


      // Send to API - but don't throw if it fails
      try {
        const response = await fetch(`/api/projects/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ progress })
        });

        if (!response.ok) {
          console.log('Progress update response status:', response.status);
          const errorText = await response.text();
          console.error('Progress update error:', errorText);

          // Return error info but don't throw
          return { success: false, error: `API Error: ${response.status}`, data: null };
        }

        const data = await response.json();
        return { success: true, error: null, data };
      } catch (error) {
        console.error("Network error:", error);
        // Return error info but don't throw
        return { success: false, error: "Network error", data: null };
      }
    },
    onSuccess: (result) => {
      // Always update UI to match cached progress, regardless of API success
      queryClient.setQueryData(
        ["/api/freshbooks/clients", id, "projects", id],
        (oldData) => {
          if (!oldData) return cachedProject;
          return { ...oldData, progress: cachedProject?.progress };
        }
      );

      // Show appropriate toast based on API result
      if (result.success) {
        toast({ 
          title: "Success", 
          description: "Project progress updated" 
        });
      } else {
        toast({
          title: "Warning",
          description: "Progress was saved locally but server update failed. It will sync when you refresh.",
          variant: "default"
        });
      }
    },
    onError: (error) => {
      console.error("Unexpected error updating progress:", error);
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
      const formattedDate = date.toISOString().split('T')[0];

      // Update both cache and localStorage
      updateCache({ due_date: formattedDate, dueDate: formattedDate });

      try {
        localStorage.setItem(`project_due_date_${id}`, formattedDate);
        console.log('Saved due date to localStorage:', formattedDate);
      } catch (e) {
        console.error('Error saving to localStorage:', e);
      }

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
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || 'Failed to update project');
      }

      return response.json();
    },
    onSuccess: (responseData, dateVariable) => {
      const formattedDate = dateVariable.toISOString().split('T')[0];
      setLocalDueDate(formattedDate);

      // Update query cache with new date
      queryClient.setQueryData(
        ["/api/freshbooks/clients", id, "projects", id],
        (oldData: any) => {
          if (!oldData) return cachedProject;
          return { ...oldData, due_date: formattedDate, dueDate: formattedDate };
        }
      );

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

      // Save budget and fixed price to localStorage
      try {
        if (budget !== undefined) {
          localStorage.setItem(`project_budget_${id}`, budget.toString());
          console.log('Saved budget to localStorage:', budget);
        }

        if (fixedPrice !== undefined) {
          localStorage.setItem(`project_fixed_price_${id}`, fixedPrice.toString());
          console.log('Saved fixed price to localStorage:', fixedPrice);
        }
      } catch (e) {
        console.error('Error saving financial details to localStorage:', e);
      }

      // Update cache
      updateCache({
        budget: budgetInCents,
        fixedPrice: fixedPriceFormatted
      });

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
      // Update the query data directly instead of invalidating
      queryClient.setQueryData(
        ["/api/freshbooks/clients", id, "projects", id],
        (oldData) => {
          if (!oldData) return cachedProject;
          return {
            ...oldData,
            budget: budget ? Math.round(budget * 100) : 0,
            fixedPrice: fixedPrice ? fixedPrice.toFixed(2) : "0.00"
          };
        }
      );

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


  const updateFinancialDetails = () => {
    updateFinancialMutation.mutate();
  };

  const updateProjectDetailsMutation = useMutation({
    mutationFn: async (data: { title?: string; description?: string }) => {
      // Add some debug logging
      console.log('Updating project details:', data);

      // Ensure description is properly formatted 
      // (trim excessive whitespace, limit length if needed)
      const formattedData = {
        ...data,
        description: data.description ? data.description.trim().substring(0, 5000) : ''
      };

      // Make sure we send all required fields
      const requestBody = {
        project: {
          title: project?.title,
          description: project?.description || '',
          client_id: project?.clientId,
          ...formattedData
        }
      };

      console.log('API request body:', requestBody);

      const response = await fetch(`/api/freshbooks/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          console.error('API error response:', errorData);
          throw new Error(errorData.details || errorData.error || `Failed to update project: ${response.status}`);
        } else {
          const errorText = await response.text();
          console.error('API error text:', errorText);
          throw new Error(`Server error: ${response.status} - ${errorText.slice(0, 100)}`);
        }
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/freshbooks/clients", id, "projects", id]
      });
      setIsEditingTitle(false);
      setIsEditingDescription(false);
      toast({
        title: "Success",
        description: "Project details updated successfully",
      });
    },
    onError: (error) => {
      console.error("Error updating project details:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update project",
        variant: "destructive",
      });
    }
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
          <div className="flex items-center gap-4">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="text-3xl font-bold w-[400px]"
                />
                <Button
                  size="sm"
                  onClick={() => updateProjectDetailsMutation.mutate({ title: editedTitle })}
                  disabled={updateProjectDetailsMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditingTitle(false);
                    setEditedTitle(project?.title || '');
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-bold">{project.title}</h1>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsEditingTitle(true)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Progress and Timeline Section - First Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Progress Section */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Project Progress</CardTitle>
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
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex-1 space-y-2">
                  <Progress value={project.progress || 0} />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{project.progress || 0}% Complete</span>
                    <span>{currentStage}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline Card */}
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

              {/* Due date */}
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
        </div>

        {/* Description and Financial Section - Second Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Project Description */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Project Description</CardTitle>
                {isAdmin && !isEditingDescription && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsEditingDescription(true)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isEditingDescription ? (
                <div className="space-y-4">
                  <Textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    className="min-h-[200px]"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        // Validate before submission
                        if (editedDescription && editedDescription.length > 5000) {
                          toast({
                            title: "Error",
                            description: "Description is too long. Maximum 5000 characters allowed.",
                            variant: "destructive",
                          });
                          return;
                        }
                        updateProjectDetailsMutation.mutate({ description: editedDescription });
                      }}
                      disabled={updateProjectDetailsMutation.isPending}
                    >
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditingDescription(false);
                        setEditedDescription(project?.description || '');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{project.description || 'No description provided'}</p>
              )}
            </CardContent>          </Card>

          {/* Financial Details */}
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