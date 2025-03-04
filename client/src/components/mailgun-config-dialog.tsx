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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const mailgunConfigSchema = z.object({
  apiKey: z.string().min(1, "API Key is required"),
  domain: z.string().min(1, "Domain is required")
});

type MailgunConfig = z.infer<typeof mailgunConfigSchema>;

export function MailgunConfigDialog({ configured }: { configured: boolean }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<MailgunConfig>({
    resolver: zodResolver(mailgunConfigSchema),
    defaultValues: {
      apiKey: "",
      domain: ""
    }
  });

  const handleUpdateConfig = async (values: MailgunConfig) => {
    try {
      const result = await fetch("/api/mailgun/update-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(values)
      });

      if (!result.ok) {
        throw new Error("Failed to update configuration");
      }

      setIsOpen(false);
      form.reset();
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
            Update your Mailgun API credentials. These will be used for sending emails.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleUpdateConfig)} className="space-y-4">
            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter your Mailgun API key" 
                      type="password"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="domain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Domain</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter your Mailgun domain"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full">
              Update Configuration
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}