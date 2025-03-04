import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Laptop, Settings, Users } from "lucide-react";

export function NavBar() {
  const { user, logoutMutation } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="border-b">
      <div className="flex h-16 items-center px-4 container mx-auto">
        <Link href="/" className="flex items-center space-x-2 mr-6">
          <Laptop className="h-6 w-6" />
          <span className="font-bold">SD Tech Pros</span>
        </Link>

        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <Link href="/">
                <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                  Home
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            {user && (
              <>
                {isAdmin ? (
                  <>
                    <NavigationMenuItem>
                      <Link href="/dashboard">
                        <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                          Dashboard
                        </NavigationMenuLink>
                      </Link>
                    </NavigationMenuItem>
                    <NavigationMenuItem>
                      <Link href="/projects">
                        <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                          Projects
                        </NavigationMenuLink>
                      </Link>
                    </NavigationMenuItem>
                    <NavigationMenuItem>
                      <Link href="/invoices">
                        <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                          Invoices
                        </NavigationMenuLink>
                      </Link>
                    </NavigationMenuItem>
                    <NavigationMenuItem>
                      <Link href="/admin/inquiries">
                        <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                          Inquiries
                        </NavigationMenuLink>
                      </Link>
                    </NavigationMenuItem>
                    <NavigationMenuItem>
                      <Link href="/clients">
                        <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                          Clients
                        </NavigationMenuLink>
                      </Link>
                    </NavigationMenuItem>
                  </>
                ) : user.role === 'customer' && (
                  <NavigationMenuItem>
                    <Link href={`/clients/${user.freshbooksId}`}>
                      <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                        My Profile
                      </NavigationMenuLink>
                    </Link>
                  </NavigationMenuItem>
                )}
              </>
            )}
            {!user && (
              <NavigationMenuItem>
                <Link href="/inquiry">
                  <NavigationMenuLink className={navigationMenuTriggerStyle()}>
                    Submit Inquiry
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
            )}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="ml-auto flex items-center space-x-4">
          {user ? (
            <>
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2">
                      {user.username}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href="/admin/settings" className="flex items-center">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/admin/users" className="flex items-center">
                        <Users className="mr-2 h-4 w-4" />
                        <span>User Management</span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="outline"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
              >
                Logout
              </Button>
            </>
          ) : (
            <Button asChild>
              <Link href="/auth">Login</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}