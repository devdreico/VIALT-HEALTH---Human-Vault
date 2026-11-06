import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Protected from "./components/Protected";
import AuthSuccessPage from "./pages/AuthSuccessPage";
import ChatPage from "./pages/ChatPage";
import DashboardPage from "./pages/DashboardPage";
import EstadoPage from "./pages/EstadoPage";
import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import RegisterPage from "./pages/RegisterPage";
import VialtDetailPage from "./pages/VialtDetailPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/auth/success" element={<AuthSuccessPage />} />
          <Route element={<Protected />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/vialt/:slug" element={<VialtDetailPage />} />
            <Route path="/vialt/:slug/ia" element={<ChatPage />} />
            <Route path="/estado" element={<EstadoPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
