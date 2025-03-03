import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import Invoices from "@/pages/invoices";
import UserManagement from "@/pages/admin/user-management";
import InquiriesPage from "@/pages/admin/inquiries";
import AdminSettings from "@/pages/admin/settings";
import CustomerInquiry from "@/pages/inquiry";
import ChangePassword from "@/pages/change-password";
import Clients from "@/pages/clients";
import { ProtectedRoute } from "./lib/protected-route";
import OAuthCallback from "@/pages/oauth-callback";

function AdminRoute(props: Parameters<typeof ProtectedRoute>[0]) {
  return (
    <ProtectedRoute
      {...props}
      requireRole="admin"
    />
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/inquiry" component={CustomerInquiry} />
      <ProtectedRoute path="/change-password" component={ChangePassword} />
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/projects" component={Projects} />
      <ProtectedRoute path="/invoices" component={Invoices} />
      <AdminRoute path="/admin/users" component={UserManagement} />
      <AdminRoute path="/admin/inquiries" component={InquiriesPage} />
      <AdminRoute path="/admin/settings" component={AdminSettings} />
      <AdminRoute path="/clients" component={Clients} />
      <Route path="/auth/callback" component={OAuthCallback} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;