import { useEffect, useState, type CSSProperties } from "react";
import { Navigate } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { signOut, usesMemoryAuth, watchSession } from "@/lib/erp/auth";
import type { ErpUser } from "@/lib/erp/types";
import { EstoquePage } from "./EstoquePage";

export function ErpShell() {
  const [user, setUser] = useState<ErpUser | null | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => watchSession(setUser), []);

  if (user === undefined) {
    return <div className="erp grid min-h-svh place-items-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!user) return <Navigate to="/erp/login" replace />;

  return (
    <div className="erp">
      <TooltipProvider>
        <SidebarProvider
          style={{
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as CSSProperties}
        >
          <AppSidebar user={user} onSignOut={() => void signOut()} />
          <SidebarInset>
            <SiteHeader
              title="Estoque"
              action={<Button size="sm" onClick={() => setCreateOpen(true)}>+ Novo produto</Button>}
            />
            <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:py-6 lg:px-6">
              {usesMemoryAuth() ? (
                <p className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground" data-testid="mock-banner">
                  Sem Supabase neste ambiente. Login e estoque ficam só neste navegador.
                </p>
              ) : null}
              <EstoquePage user={user} createOpen={createOpen} onCreateOpenChange={setCreateOpen} />
            </div>
          </SidebarInset>
        </SidebarProvider>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </div>
  );
}
