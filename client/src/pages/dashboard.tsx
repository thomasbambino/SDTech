import { NavBar } from "@/components/nav-bar";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Project, Invoice } from "@shared/schema";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { FileText, DollarSign } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: recentInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/projects/recent-invoices"],
  });

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Welcome back, {user?.companyName}</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recent Projects
              </CardTitle>
            </CardHeader>
            <CardContent>
              {projects?.slice(0, 5).map((project) => (
                <div
                  key={project.id}
                  className="py-2 border-b last:border-0 flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium">{project.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {project.status}
                    </div>
                  </div>
                  <Button variant="outline" asChild size="sm">
                    <Link href={`/projects/${project.id}`}>View</Link>
                  </Button>
                </div>
              ))}
              <Button className="w-full mt-4" asChild>
                <Link href="/projects">View All Projects</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Recent Invoices
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentInvoices?.slice(0, 5).map((invoice) => (
                <div
                  key={invoice.id}
                  className="py-2 border-b last:border-0 flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium">
                      Invoice #{invoice.id}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      ${invoice.amount / 100}
                    </div>
                  </div>
                  <Button variant="outline" asChild size="sm">
                    <Link href={`/invoices/${invoice.id}`}>View</Link>
                  </Button>
                </div>
              ))}
              <Button className="w-full mt-4" asChild>
                <Link href="/invoices">View All Invoices</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
