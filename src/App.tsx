import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CondoProvider } from "@/contexts/CondoContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Cadastro from "./pages/Cadastro";
import NoCondo from "./pages/NoCondo";
import Dashboard from "./pages/Dashboard";
import Condominios from "./pages/Condominios";
import Moradores from "./pages/Moradores";
import Configuracoes from "./pages/Configuracoes";
import OrdensServico from "./pages/OrdensServico";
import OrdemServicoDetalhe from "./pages/OrdemServicoDetalhe";
import NotasFiscais from "./pages/NotasFiscais";
import Almoxarifado from "./pages/Almoxarifado";
import Transparencia from "./pages/Transparencia";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CondoProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/cadastro" element={<Cadastro />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/no-condo" element={<NoCondo />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/condominios" element={<Condominios />} />
                <Route path="/moradores" element={<Moradores />} />
                <Route path="/ordens-servico" element={<OrdensServico />} />
                <Route path="/ordens-servico/:id" element={<OrdemServicoDetalhe />} />
                <Route path="/notas-fiscais" element={<NotasFiscais />} />
                <Route path="/almoxarifado" element={<Almoxarifado />} />
                <Route path="/transparencia" element={<Transparencia />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
              </Route>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </CondoProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
