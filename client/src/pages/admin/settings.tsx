import { useState, useEffect } from "react";
import { NavBar } from "@/components/nav-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BrandingSettings, brandingSchema } from "@shared/schema";

// Extend schema to include file uploads
const formSchema = brandingSchema.extend({
  siteLogo: z.instanceof(File).optional(),
  favicon: z.instanceof(File).optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function AdminSettings() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: brandingSettings, isLoading } = useQuery<BrandingSettings>({
    queryKey: ["/api/admin/branding"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      siteTitle: "",
      tabText: "",
    }
  });

  // Update form when settings are loaded
  useEffect(() => {
    if (brandingSettings) {
      form.reset({
        siteTitle: brandingSettings.siteTitle,
        tabText: brandingSettings.tabText,
      });
    }
  }, [brandingSettings, form]);

  const handleSubmit = async (data: FormData) => {
    try {
      setIsSubmitting(true);

      const formData = new FormData();
      formData.append('siteTitle', data.siteTitle);
      formData.append('tabText', data.tabText);

      if (data.siteLogo instanceof File) {
        formData.append('siteLogo', data.siteLogo);
      }

      if (data.favicon instanceof File) {
        formData.append('favicon', data.favicon);
      }

      const response = await fetch('/api/admin/branding', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update branding');
      }

      await response.json();

      toast({
        title: "Success",
        description: "Branding settings updated successfully",
      });

      // Refresh the branding data
      queryClient.invalidateQueries({ queryKey: ["/api/admin/branding"] });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to update branding',
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Branding Settings</h1>

        <Card>
          <CardHeader>
            <CardTitle>Website Branding</CardTitle>
            <CardDescription>
              Customize your website's appearance with branding elements
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="siteTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter site title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tabText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Browser Tab Text</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter tab text" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="siteLogo"
                  render={({ field: { onChange, ...field } }) => (
                    <FormItem>
                      <FormLabel>Site Logo</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-4">
                          <Input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) onChange(file);
                            }}
                            {...field}
                          />
                          {brandingSettings?.logoPath && (
                            <img
                              src={brandingSettings.logoPath}
                              alt="Current logo"
                              className="h-10 w-10 object-contain"
                            />
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="favicon"
                  render={({ field: { onChange, ...field } }) => (
                    <FormItem>
                      <FormLabel>Favicon</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-4">
                          <Input
                            type="file"
                            accept=".ico,.png"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) onChange(file);
                            }}
                            {...field}
                          />
                          {brandingSettings?.faviconPath && (
                            <img
                              src={brandingSettings.faviconPath}
                              alt="Current favicon"
                              className="h-8 w-8 object-contain"
                            />
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Branding'
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}