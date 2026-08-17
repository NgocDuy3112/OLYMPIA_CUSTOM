import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface AuthGuardProps {
  children?: React.ReactNode;
  requiredRole?: "admin" | "mc" | "player";
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children, requiredRole }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user.role !== requiredRole && user.role !== "admin") {
    // Admin can access everything, others are restricted
    return <Navigate to="/login" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
