import { LayoutDashboard, Building2, Users, Settings, LogOut, ClipboardList, FileText, Warehouse, Eye, Briefcase } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
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
  SINDICO: ['/dashboard', '/ordens-servico', '/notas-fiscais', '/almoxarifado', '/transparencia', '/moradores', '/configuracoes'],
  ADMIN: ['/dashboard', '/ordens-servico', '/notas-fiscais', '/almoxarifado', '/transparencia', '/moradores', '/condominios', '/configuracoes'],
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
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        {!collapsed ? (
          <h1 className="text-lg font-bold text-sidebar-foreground tracking-tight">
            NFe Vigia
          </h1>
        ) : (
          <span className="text-lg font-bold text-sidebar-foreground">NV</span>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url || location.pathname.startsWith(item.url + '/')}>
                    <NavLink
                      to={item.url}
                      end={item.url === '/dashboard'}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && user && (
          <p className="mb-2 truncate text-xs text-sidebar-foreground/60">{user.email}</p>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-destructive"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
