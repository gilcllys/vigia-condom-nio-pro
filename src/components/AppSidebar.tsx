import { LayoutDashboard, Building2, Users, Settings, LogOut, ClipboardList, FileText, Warehouse, Eye, Briefcase } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
import nfevigiaShield from '@/assets/nfevigia-shield.png';
import nfevigiaLogoFull from '@/assets/nfevigia-logo-full.png';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

type MenuItem = { title: string; url: string; icon: typeof LayoutDashboard };

const allMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Ordens de Serviço', url: '/ordens-servico', icon: ClipboardList },
  { title: 'Notas Fiscais', url: '/notas-fiscais', icon: FileText },
  { title: 'Almoxarifado', url: '/almoxarifado', icon: Warehouse },
  { title: 'Portal da Transparência', url: '/transparencia', icon: Eye },
  { title: 'Moradores', url: '/moradores', icon: Users },
  { title: 'Prestadores', url: '/prestadores', icon: Briefcase },
  { title: 'Condomínios', url: '/condominios', icon: Building2 },
  { title: 'Configurações', url: '/configuracoes', icon: Settings },
];

const MENU_BY_ROLE: Record<string, string[]> = {
  MORADOR: ['/dashboard', '/ordens-servico', '/transparencia'],
  ZELADOR: ['/dashboard', '/ordens-servico', '/almoxarifado', '/transparencia'],
  SUBSINDICO: ['/dashboard', '/ordens-servico', '/notas-fiscais', '/almoxarifado', '/transparencia'],
  CONSELHO: ['/dashboard', '/ordens-servico', '/notas-fiscais', '/almoxarifado', '/transparencia'],
  SINDICO: ['/dashboard', '/ordens-servico', '/notas-fiscais', '/almoxarifado', '/transparencia', '/moradores', '/prestadores', '/configuracoes'],
  ADMIN: ['/dashboard', '/ordens-servico', '/notas-fiscais', '/almoxarifado', '/transparencia', '/moradores', '/prestadores', '/condominios', '/configuracoes'],
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { role } = useCondo();

  const allowedUrls = role ? (MENU_BY_ROLE[role] ?? MENU_BY_ROLE.MORADOR) : allMenuItems.map(i => i.url);
  const menuItems = allMenuItems.filter(item => allowedUrls.includes(item.url));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border/60 px-4 py-4">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <img src={nfevigiaShield} alt="NFeVigia" className="h-9 w-9 object-contain" />
            <span className="text-lg font-bold tracking-tight">
              <span className="text-sidebar-foreground">NFe</span>
              <span className="text-primary">Vigia</span>
            </span>
          </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/50 text-[10px] uppercase tracking-[0.15em] font-semibold px-4">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 px-2">
              {menuItems.map((item) => {
                const isActive = location.pathname === item.url || location.pathname.startsWith(item.url + '/');
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <NavLink
                        to={item.url}
                        end={item.url === '/dashboard'}
                        className="rounded-md px-3 py-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all duration-150"
                        activeClassName="bg-primary/15 text-primary font-medium shadow-[inset_3px_0_0_0_hsl(var(--primary))] !text-primary"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="text-sm">{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 p-3">
        {!collapsed && user && (
          <>
            <p className="mb-2 truncate text-xs text-sidebar-foreground/40 px-1">{user.email}</p>
            <Separator className="mb-2 bg-sidebar-border/40" />
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="text-sm">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
