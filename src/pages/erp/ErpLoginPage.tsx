import { Link } from "react-router-dom";
import { LoginForm } from "@/components/login-form";

export function ErpLoginPage() {
  return (
    <div className="erp flex min-h-svh flex-col items-center justify-center gap-6 bg-erp-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link to="/" className="flex items-center gap-2 self-center font-medium">
          <img src="/logo-3dxap.png" alt="" className="size-8 rounded-md" />
          3DXAP
        </Link>
        <LoginForm />
      </div>
    </div>
  );
}
