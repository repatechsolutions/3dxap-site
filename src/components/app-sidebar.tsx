import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ErpUser } from "@/lib/erp/types";
import {
  BadgePercentIcon,
  CalculatorIcon,
  FileTextIcon,
  PackageIcon,
  ReceiptIcon,
  ScanBarcodeIcon,
  TicketIcon,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

export function AppSidebar({ user, onSignOut }: { user: ErpUser; onSignOut: () => void }) {
  const [params] = useSearchParams();
  const aba = params.get("aba") ?? "produtos";
  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/erp/estoque" />}>
              <img src="/logo-3dxap.png" alt="" className="size-8 rounded-lg" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">3DXAP</span>
                <span className="truncate text-xs text-muted-foreground">ERP</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/erp/estoque" />} isActive={aba !== "bipar"}>
                  <PackageIcon />
                  <span>Estoque</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link to="/erp/estoque?aba=bipar" />} isActive={aba === "bipar"}>
                  <ScanBarcodeIcon />
                  <span>Vendas / Bipar</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled className="pr-14">
                  <BadgePercentIcon />
                  <span>Promoções</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-[10px] font-normal text-muted-foreground">Fase 2</SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled className="pr-14">
                  <TicketIcon />
                  <span>Rifas</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-[10px] font-normal text-muted-foreground">Fase 2</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Escritório</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton className="pr-24" render={<Link to="/admin?tab=quotes" />}>
                  <FileTextIcon />
                  <span>Orçamentos</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-[10px] font-normal text-muted-foreground">Ainda no /admin</SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton className="pr-24" render={<Link to="/admin/calculadora" />}>
                  <CalculatorIcon />
                  <span>Calculadora</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-[10px] font-normal text-muted-foreground">Ainda no /admin</SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton disabled className="pr-20">
                  <ReceiptIcon />
                  <span>Nota fiscal</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-[10px] font-normal text-muted-foreground">Fase futura</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} onSignOut={onSignOut} />
      </SidebarFooter>
    </Sidebar>
  );
}
