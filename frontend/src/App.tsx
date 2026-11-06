import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Protected from "./components/Protected";
import { useAuth, type User } from "./stores/auth";

const AuthSuccessPage = lazy(() => import("./pages/AuthSuccessPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const EstadoPage = lazy(() => import("./pages/EstadoPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const OpenRouterSettingsPage = lazy(() => import("./pages/OpenRouterSettingsPage"));
const VialtDetailPage = lazy(() => import("./pages/VialtDetailPage"));

export default function App() {
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void import("./lib/supabase").then(({ isSupabaseConfigured, supabase }) => {
      if (!active) return;
      if (!isSupabaseConfigured) {
        useAuth.setState({ initialized: true });
        return;
      }
      const applySession = (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) => {
        if (!active) return;
        if (!session) {
          useAuth.getState().clear();
          return;
        }
        const metadata = session.user.user_metadata;
        const user: User = {
          id: session.user.id,
          email: session.user.email ?? "",
          nombre: metadata.nombre ?? metadata.full_name ?? metadata.name ?? session.user.email?.split("@")[0] ?? "Usuario",
          picture: metadata.avatar_url ?? metadata.picture ?? null,
        };
        useAuth.getState().setAuth(session.access_token, user);
      };
      const { data } = supabase.auth.onAuthStateChange((_event, session) => applySession(session));
      unsubscribe = () => data.subscription.unsubscribe();
      void supabase.auth.getSession().then(({ data: sessionData, error }) => {
        applySession(error ? null : sessionData.session);
      });
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={<main className="mx-auto max-w-lg px-6 py-14 text-sm text-muted">Cargando…</main>}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/registro" element={<RegisterPage />} />
            <Route path="/auth/success" element={<AuthSuccessPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route element={<Protected />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/vialt/:slug" element={<VialtDetailPage />} />
              <Route path="/vialt/:slug/ia" element={<ChatPage />} />
              <Route path="/estado" element={<EstadoPage />} />
              <Route path="/configuracion-ia" element={<OpenRouterSettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
