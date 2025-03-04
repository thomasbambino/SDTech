import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Edit2, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface EditNoteDialogProps {
  projectId: string;
  note: {
    id: number;
    content: string;
  };
}

export function EditNoteDialog({ projectId, note }: EditNoteDialogProps) {
  const [editedContent, setEditedContent] = useState(note.content);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/projects/${projectId}/notes/${note.id}`);
    },
    onSuccess: () => {
      setIsOpen(false);
      toast({
        title: "Success",
        description: "Note deleted successfully",
      });
      // Use the correct query key format
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "notes"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("PATCH", `/api/projects/${projectId}/notes/${note.id}`, { content });
    },
    onSuccess: () => {
      setIsOpen(false);
      toast({
        title: "Success",
        description: "Note updated successfully",
      });
      // Use the correct query key format and force a refetch
      queryClient.invalidateQueries({ 
        queryKey: ["/api/projects", projectId, "notes"],
        refetchType: 'all'
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this note?")) {
      deleteMutation.mutate();
    }
  };

  const handleUpdate = async () => {
    if (editedContent.trim()) {
      updateMutation.mutate(editedContent);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Edit2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Note</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="min-h-[100px]"
          />
          <div className="flex justify-between">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Note
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !editedContent.trim()}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}