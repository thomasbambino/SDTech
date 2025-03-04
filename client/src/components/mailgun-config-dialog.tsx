import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

export function MailgunConfigDialog({ configured }: { configured: boolean }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const handleUpdateConfig = async () => {
    try {
      // First, trigger the ask_secrets tool to get Mailgun credentials
      const response = await fetch("/api/mailgun/ask-secrets", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to get Mailgun secrets"); // More specific error message
      }

      // If secrets were successfully set, update the configuration
      const result = await fetch("/api/mailgun/update-config", {
        method: "POST"
      });

      if (!result.ok) {
        throw new Error("Failed to update Mailgun configuration");
      }

      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/mailgun/status"] });

      toast({
        title: "Success",
        description: "Mailgun configuration updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update configuration",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={configured ? "destructive" : "default"}>
          {configured ? 'Update Configuration' : 'Configure Mailgun'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure Mailgun Integration</DialogTitle>
          <DialogDescription>
            Update your Mailgun API credentials. These will be securely stored and used for sending emails.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <p className="text-sm">
              You'll be prompted to securely enter your Mailgun credentials:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              <li>Mailgun API Key</li>
              <li>Mailgun Domain</li>
            </ul>
          </div>
          <Button 
            className="w-full"
            onClick={handleUpdateConfig}
          >
            Update Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}