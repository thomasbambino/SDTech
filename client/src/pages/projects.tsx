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
import { Loader2, Calendar, DollarSign, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";

interface Project {
  id: string;
  title: string;
  description?: string;
  status?: string;
  dueDate?: string;
  due_date?: string;
  budget?: number;
  fixedPrice?: string | boolean;
  fixed_price?: string | boolean;
  createdAt?: string;
  created_at?: string;
  clientId?: string;
  client_id?: string;
  active?: boolean;
  complete?: boolean;
  progress?: number;
  freshbooksId?: string;
}

// Helper function to safely format dates
const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString) return "Not set";
  try {
    // Handle UNIX timestamps (seconds since epoch)
    if (!isNaN(Number(dateString))) {
      const timestamp = Number(dateString);
      // If it's in seconds (not milliseconds), convert to milliseconds
      const date = new Date(timestamp < 10000000000 ? timestamp * 1000 : timestamp);
      return date.toLocaleDateString();
    }
    return new Date(dateString).toLocaleDateString();
  } catch (e) {
    console.error("Error formatting date:", e, "for value:", dateString);
    return "Invalid date";
  }
};

// Helper to get fixed price regardless of format
const getFixedPrice = (project: Project): string | undefined => {
  if (typeof project.fixedPrice === 'string') return project.fixedPrice;
  if (typeof project.fixed_price === 'string') return project.fixed_price;
  if (project.fixedPrice === true) return "Yes";
  if (project.fixed_price === true) return "Yes";
  return undefined;
};

// Helper to get due date regardless of format
const getDueDate = (project: Project): string | undefined => {
  return project.dueDate || project.due_date;
};

// Helper to get project status
const getStatus = (project: Project): string => {
  if (project.status) return project.status;
  if (project.complete === true) return "Completed";
  if (project.active === true) return "Active";
  if (project.active === false) return "Inactive";
  return "Unknown";
};

// Helper to get created date
const getCreatedDate = (project: Project): string | undefined => {
  return project.createdAt || project.created_at;
};

// Format currency
const formatCurrency = (value: number | string | undefined): string => {
  if (!value) return "$0";
  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  // If value seems too large (e.g., in cents), convert to dollars
  const adjustedValue = numValue > 1000 && Number.isInteger(numValue) ? numValue / 100 : numValue;

  return `$${adjustedValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

// CRITICAL FUNCTION: Get the correct ID to use for project details link
const getProjectDetailsId = (project: Project): string => {
  // If the project has a freshbooksId, use that for the link
  // This handles the case where local DB has its own ID but we need to link to the Freshbooks ID
  if (project.freshbooksId) {
    return project.freshbooksId;
  }
  // Otherwise use the project's own ID
  return project.id;
};

export default function Projects() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timestamp, setTimestamp] = useState(Date.now()); // Used to force refetch
  const [showDebugInfo, setShowDebugInfo] = useState(false); // Toggle for debug info

  // Simplified - just use the freshbooks endpoint for now
  const freshbooksProjectsEndpoint = `/api/freshbooks/projects?t=${timestamp}`;

  // Just fetch from Freshbooks which has the most up-to-date data
  const {
    data: freshbooksProjects = [],
    isLoading: isLoadingFreshbooks,
    error: freshbooksError,
    refetch: refetchFreshbooks
  } = useQuery({
    queryKey: ['freshbooksProjects', timestamp],
    queryFn: async () => {
      console.log(`Fetching Freshbooks projects`);
      try {
        const response = await fetch(freshbooksProjectsEndpoint, {
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });

        if (!response.ok) {
          console.log(`Freshbooks projects endpoint failed: ${response.status}`);
          throw new Error(`Failed to fetch Freshbooks projects: ${response.status}`);
        }

        const data = await response.json();
        console.log("Freshbooks projects data:", data);
        return normalizeProjects(data);
      } catch (error) {
        console.error("Error fetching Freshbooks projects:", error);
        throw error;
      }
    },
    staleTime: 0,
    cacheTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    enabled: !!user
  });

  // Function to normalize projects data regardless of source
  function normalizeProjects(data: any[]): Project[] {
    if (!Array.isArray(data)) {
      console.error("Expected array of projects, received:", data);
      return [];
    }

    return data.map((project: any) => ({
      id: project.id?.toString(),
      title: project.title || "Untitled Project",
      description: project.description || '',
      status: getStatus(project),
      dueDate: project.dueDate || project.due_date,
      due_date: project.due_date || project.dueDate,
      clientId: project.clientId || project.client_id,
      client_id: project.client_id || project.clientId,
      fixedPrice: project.fixedPrice || project.fixed_price,
      fixed_price: project.fixed_price || project.fixedPrice,
      createdAt: project.createdAt || project.created_at,
      created_at: project.created_at || project.createdAt,
      budget: project.budget,
      active: project.active,
      complete: project.complete,
      progress: project.progress,
      freshbooksId: project.freshbooksId // Keep track of the Freshbooks ID if it exists
    }));
  }

  // Handle manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Update timestamp to force new queries
      setTimestamp(Date.now());

      // Manually trigger refetch
      await refetchFreshbooks();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Toggle debug info
  const toggleDebugInfo = () => {
    setShowDebugInfo(!showDebugInfo);
  };

  // Effect to trigger refresh when component mounts
  useEffect(() => {
    handleRefresh();
  }, []); // Empty dependency array means this runs once on mount

  if (isLoadingFreshbooks && freshbooksProjects.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <NavBar />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">Projects</h1>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleRefresh} 
              disabled={isRefreshing}
              title="Refresh project data"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            {isAdmin && <CreateProjectDialog />}
          </div>
        </div>

        {/* Debug toggle */}
        <div className="mb-4">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={toggleDebugInfo}
            className="text-xs text-muted-foreground"
          >
            {showDebugInfo ? "Hide Debug Info" : "Show Debug Info"}
          </Button>
        </div>

        {freshbooksError && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>
              {freshbooksError instanceof Error ? freshbooksError.message : "Failed to load projects data"}
            </AlertDescription>
          </Alert>
        )}

        {!freshbooksProjects?.length ? (
          <Alert>
            <AlertDescription>
              {isAdmin 
                ? "No projects found. Create a new project using the button above."
                : "No projects assigned to you yet."}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {freshbooksProjects.map((project) => (
              <Card key={project.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{project.title}</CardTitle>
                      <CardDescription>
                        Created {formatDate(getCreatedDate(project))}
                      </CardDescription>
                    </div>
                    <Badge 
                      variant={
                        getStatus(project).toLowerCase().includes('active') ? 'default' : 
                        getStatus(project).toLowerCase().includes('complete') ? 'secondary' : 
                        'secondary'
                      }
                    >
                      {getStatus(project)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground line-clamp-3 mb-4">
                    {project.description || 'No description provided'}
                  </p>
                  <div className="space-y-2 mb-4">
                    {getDueDate(project) && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4 mr-2" />
                        Due: {formatDate(getDueDate(project))}
                      </div>
                    )}
                    {project.fixedPrice === true || project.fixed_price === true ? (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <DollarSign className="h-4 w-4 mr-2" />
                        Fixed Price: Yes
                      </div>
                    ) : getFixedPrice(project) ? (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <DollarSign className="h-4 w-4 mr-2" />
                        Fixed Price: {formatCurrency(getFixedPrice(project))}
                      </div>
                    ) : null}
                    {project.budget && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <DollarSign className="h-4 w-4 mr-2" />
                        Budget: {formatCurrency(project.budget)}
                      </div>
                    )}
                    {project.progress !== undefined && (
                      <div className="flex items-center text-sm text-muted-foreground">
                        <span>Progress: {project.progress}%</span>
                      </div>
                    )}

                    {/* Debug info */}
                    {showDebugInfo && (
                      <div className="text-xs text-muted-foreground mt-3 p-2 bg-muted rounded-sm">
                        <div>Project ID: {project.id}</div>
                        {project.freshbooksId && <div>Freshbooks ID: {project.freshbooksId}</div>}
                        <div>Link ID: {getProjectDetailsId(project)}</div>
                      </div>
                    )}
                  </div>

                  <Button variant="outline" className="w-full" asChild>
                    <Link href={`/projects/${getProjectDetailsId(project)}`}>View Details</Link>
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