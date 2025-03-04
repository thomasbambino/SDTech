import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import Dashboard from "@/pages/dashboard";
import Invoices from "@/pages/invoices";
import UserManagement from "@/pages/admin/user-management";
import InquiriesPage from "@/pages/admin/inquiries";
import AdminSettings from "@/pages/admin/settings";
import CustomerInquiry from "@/pages/inquiry";
import ChangePassword from "@/pages/change-password";
import Clients from "@/pages/clients";
import Projects from "@/pages/projects";
import ClientProfile from "@/pages/client-profile";
import ProjectDetails from "@/pages/project-details";
import { ProtectedRoute } from "./lib/protected-route";
import OAuthCallback from "@/pages/oauth-callback";
import { Redirect } from "wouter";

function AdminRoute(props: Parameters<typeof ProtectedRoute>[0]) {
  return (
    <ProtectedRoute
      {...props}
      requireRole="admin"
    />
  );
}

function CustomerRoute(props: { path: string; id: string; component: () => JSX.Element }) {
  return (
    <ProtectedRoute
      path={props.path}
      component={() => {
        const { user } = useAuth();
        if (user?.role === 'customer' && user.freshbooksId !== props.id) {
          return <Redirect to="/" />;
        }
        return <props.component />;
      }}
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

      {/* Admin-only routes */}
      <AdminRoute path="/dashboard" component={Dashboard} />
      <AdminRoute path="/projects" component={Projects} />
      <AdminRoute path="/invoices" component={Invoices} />
      <AdminRoute path="/admin/users" component={UserManagement} />
      <AdminRoute path="/admin/inquiries" component={InquiriesPage} />
      <AdminRoute path="/admin/settings" component={AdminSettings} />
      <AdminRoute path="/clients" component={Clients} />

      {/* Project details route - accessible by both admin and the client */}
      <Route path="/projects/:id">
        {(params) => (
          <ProtectedRoute
            path={`/projects/${params.id}`}
            component={ProjectDetails}
          />
        )}
      </Route>

      {/* Client profile route - accessible by both admin and the specific customer */}
      <Route path="/clients/:id">
        {(params) => (
          <CustomerRoute
            path={`/clients/${params.id}`}
            id={params.id}
            component={ClientProfile}
          />
        )}
      </Route>

      {/* OAuth callback route */}
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