import { useEffect } from "react";
import { useLocation, useNavigate } from "wouter";
import { Loader2 } from "lucide-react";

export default function OAuthCallback() {
  const [, navigate] = useLocation();

  useEffect(() => {
    // URL will contain code parameter which is handled by our server-side route
    // After server processes it, redirect back to clients page
    navigate("/clients?freshbooks=connected");
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-border" />
      <span className="ml-2">Processing Freshbooks authorization...</span>
    </div>
  );
}
