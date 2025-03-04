import { useState, useEffect } from "react";
import { NavBar } from "@/components/nav-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, X, Upload } from "lucide-react";
import { useLocation } from "wouter";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MailgunConfigDialog } from "@/components/mailgun-config-dialog";

const brandingSchema = z.object({
  siteTitle: z.string().min(1, "Site title is required"),
  tabText: z.string().min(1, "Tab text is required"),
  siteLogo: z.instanceof(File).optional(),
  favicon: z.instanceof(File).optional(),
});

type BrandingFormData = z.infer<typeof brandingSchema>;

export default function AdminSettings() {
  const { toast } = useToast();
  const [location] = useLocation();

  const { data: freshbooksStatus, isLoading } = useQuery({
    queryKey: ["/api/freshbooks/connection-status"],
  });

  const { data: mailgunStatus, isLoadingMailgun } = useQuery({
    queryKey: ["/api/mailgun/status"],
  });

  const { data: brandingSettings, isLoading: isLoadingBranding } = useQuery({
    queryKey: ["/api/admin/branding"],
  });

  const form = useForm<BrandingFormData>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      siteTitle: "",
      tabText: "",
    }
  });

  // Update form when branding settings are loaded
  useEffect(() => {
    if (brandingSettings) {
      form.reset({
        siteTitle: brandingSettings.siteTitle,
        tabText: brandingSettings.tabText,
      });

      // Update page title and favicon
      document.title = brandingSettings.tabText;

      const existingFavicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (brandingSettings.faviconPath) {
        if (existingFavicon) {
          existingFavicon.href = brandingSettings.faviconPath;
        } else {
          const favicon = document.createElement('link');
          favicon.rel = 'icon';
          favicon.href = brandingSettings.faviconPath;
          document.head.appendChild(favicon);
        }
      }
    }
  }, [brandingSettings, form]);

  const brandingMutation = useMutation({
    mutationFn: async (data: BrandingFormData) => {
      const formData = new FormData();
      formData.append('siteTitle', data.siteTitle);
      formData.append('tabText', data.tabText);
      if (data.siteLogo) formData.append('siteLogo', data.siteLogo);
      if (data.favicon) formData.append('favicon', data.favicon);

      const res = await apiRequest("POST", "/api/admin/branding", formData);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update branding");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Branding settings updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/branding"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/freshbooks/disconnect");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to disconnect from Freshbooks");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/freshbooks/connection-status"] });
      toast({
        title: "Success",
        description: "Disconnected from Freshbooks successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const connectToFreshbooks = async () => {
    try {
      const res = await apiRequest("GET", "/api/freshbooks/auth");
      if (!res.ok) {
        throw new Error("Failed to get Freshbooks authentication URL");
      }
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to connect to Freshbooks",
        variant: "destructive",
      });
    }
  };

  // Show toast based on URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const freshbooksStatus = params.get('freshbooks');

    if (freshbooksStatus === 'connected') {
      toast({
        title: "Success",
        description: "Successfully connected to Freshbooks",
      });
    } else if (freshbooksStatus === 'error') {
      toast({
        title: "Error",
        description: "Failed to connect to Freshbooks",
        variant: "destructive",
      });
    }
  }, [location, toast]);

  if (isLoadingBranding) {
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
        <h1 className="text-3xl font-bold mb-8">Admin Settings</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Branding */}
          <Card>
            <CardHeader>
              <CardTitle>Branding</CardTitle>
              <CardDescription>
                Customize your application's appearance with branding elements like logo, favicon, and titles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => brandingMutation.mutate(data))} className="space-y-4">
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
                    render={({ field: { onChange, value, ...field } }) => (
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
                    render={({ field: { onChange, value, ...field } }) => (
                      <FormItem>
                        <FormLabel>Favicon</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-4">
                            <Input
                              type="file"
                              accept="image/x-icon,image/png"
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
                    className="w-full"
                    disabled={brandingMutation.isPending}
                  >
                    {brandingMutation.isPending ? (
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

          {/* Right Column - Integration Settings */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Freshbooks Integration</CardTitle>
                <CardDescription>
                  Connect your Freshbooks account to enable client management and invoicing features.
                  This connection will be used across all features of the application.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>Status:</span>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : freshbooksStatus?.connected ? (
                      <div className="flex items-center gap-2 text-green-500">
                        <Check className="h-4 w-4" />
                        <span>Connected</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-500">
                        <X className="h-4 w-4" />
                        <span>Not Connected</span>
                      </div>
                    )}
                  </div>

                  {freshbooksStatus?.connected ? (
                    <Button
                      variant="destructive"
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                    >
                      {disconnectMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Disconnecting...
                        </>
                      ) : (
                        'Disconnect'
                      )}
                    </Button>
                  ) : (
                    <Button onClick={connectToFreshbooks}>
                      Connect to Freshbooks
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mailgun Integration</CardTitle>
                <CardDescription>
                  Configure Mailgun settings for sending automated emails, notifications, and client communications.
                  This integration is essential for password resets and system notifications.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>Status:</span>
                    {isLoadingMailgun ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : mailgunStatus?.configured ? (
                      <div className="flex items-center gap-2 text-green-500">
                        <Check className="h-4 w-4" />
                        <span>Configured</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-500">
                        <X className="h-4 w-4" />
                        <span>Not Configured</span>
                      </div>
                    )}
                  </div>
                  <MailgunConfigDialog configured={!!mailgunStatus?.configured} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}