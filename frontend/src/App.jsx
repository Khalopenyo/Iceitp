import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import AuthLayout from "./components/AuthLayout.jsx";
import OrgConsoleLayout from "./components/OrgConsoleLayout.jsx";
import Overview from "./pages/console/Overview.jsx";
import Branding from "./pages/console/Branding.jsx";
import Onboarding from "./pages/console/Onboarding.jsx";
import Signup from "./pages/console/Signup.jsx";
import OpsLayout from "./components/OpsLayout.jsx";
import OpsDashboard from "./pages/ops/OpsDashboard.jsx";
import OpsTenants from "./pages/ops/OpsTenants.jsx";
import ConsoleProgram from "./pages/console/ConsoleProgram.jsx";
import ConsoleSettings from "./pages/console/ConsoleSettings.jsx";
import ConsoleSpeakers from "./pages/console/ConsoleSpeakers.jsx";
import ConsoleContent from "./pages/console/ConsoleContent.jsx";
import ConsoleTalks from "./pages/console/ConsoleTalks.jsx";
import ConsoleMap from "./pages/console/ConsoleMap.jsx";
import ConsoleParticipants from "./pages/console/ConsoleParticipants.jsx";
import ConsoleModeration from "./pages/console/ConsoleModeration.jsx";
import ConsoleDocs from "./pages/console/ConsoleDocs.jsx";
import ConsoleBilling from "./pages/console/ConsoleBilling.jsx";
import ConsoleCheckin from "./pages/console/ConsoleCheckin.jsx";
import ConsoleTeam from "./pages/console/ConsoleTeam.jsx";
import ConsoleFeedback from "./pages/console/ConsoleFeedback.jsx";
import EventShell from "./components/EventShell.jsx";
import EventLanding from "./pages/event/EventLanding.jsx";
import EventDashboard from "./pages/event/EventDashboard.jsx";
import EventProgram from "./pages/event/EventProgram.jsx";
import EventSections from "./pages/event/EventSections.jsx";
import EventSectionDetail from "./pages/event/EventSectionDetail.jsx";
import EventSpeakers from "./pages/event/EventSpeakers.jsx";
import EventVenue from "./pages/event/EventVenue.jsx";
import EventLive from "./pages/event/EventLive.jsx";
import EventDocuments from "./pages/event/EventDocuments.jsx";
import EventChat from "./pages/event/EventChat.jsx";
import EventProfile from "./pages/event/EventProfile.jsx";
import EventSchedule from "./pages/event/EventSchedule.jsx";
import EventFeedback from "./pages/event/EventFeedback.jsx";
import EventMap from "./pages/event/EventMap.jsx";
import PlatformLanding from "./pages/PlatformLanding.jsx";
import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import { isAuthenticated, getUser } from "./lib/auth.js";
import NoAccess from "./pages/NoAccess.jsx";
import NotFound from "./pages/NotFound.jsx";
import VerifyCertificate from "./pages/VerifyCertificate.jsx";
import About from "./pages/About.jsx";
import Legal from "./pages/Legal.jsx";
import BadgeCheckIn from "./pages/BadgeCheckIn.jsx";
import QuestionPrompt from "./pages/QuestionPrompt.jsx";
import ApprovedQuestions from "./pages/ApprovedQuestions.jsx";
import { fetchBranding, applyBranding, isPlatformHost } from "./lib/org.js";

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  // Оператор платформы — не участник; уводим в его консоль, а не в участника ЛК.
  if (getUser()?.role === "operator") {
    return <Navigate to="/ops" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  const user = getUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!user || !["admin", "org"].includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }
  return children;
}

// ConsoleRoute guards the organizer console: the owner (org/admin) AND invited
// staff reach it; owner-only operations are gated server-side and hidden in the UI.
function ConsoleRoute({ children }) {
  const user = getUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!["admin", "org", "staff"].includes(user.role)) {
    return <Navigate to="/forbidden" replace />;
  }
  return children;
}

// OwnerRoute guards owner-only console pages (branding, billing): invited staff are
// bounced back to the console overview. The server enforces these too (403); this
// keeps staff from landing on an owner-only screen whose save always fails.
function OwnerRoute({ children }) {
  const user = getUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!["admin", "org"].includes(user.role)) {
    return <Navigate to="/console" replace />;
  }
  return children;
}

// OpsRoute guards the platform operator console (cross-tenant). Only RoleOperator;
// the backend /ops/* routes enforce the same.
function OpsRoute({ children }) {
  const user = getUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== "operator") {
    return <Navigate to="/forbidden" replace />;
  }
  return children;
}

// RootLayout выбирает, что показать на «/»: на голом домене платформы —
// маркетинговый лендинг Кворума; на тенант-поддомене — сайт вуза (EventShell с
// сайдбаром и дочерними маршрутами через Outlet).
function RootLayout() {
  const { pathname } = useLocation();
  if (isPlatformHost()) {
    // На голом домене «/» — лендинг; тенант-диплинки (/program и т.п.) сюда не
    // относятся → отдаём 404, а не маркетинговую страницу под чужим путём.
    return pathname === "/" ? <PlatformLanding /> : <NotFound />;
  }
  return <EventShell />;
}

export default function App() {
  useEffect(() => {
    // На голом домене платформы не применяем брендинг дефолтного вуза (на голом
    // хосте /api/org резолвится в дефолтный тенант) — платформа нейтральна.
    if (isPlatformHost()) return;
    // Apply the resolved tenant's branding (primary color) over the academic-blue
    // defaults. Silent fallback to the defaults if the org has no custom color.
    fetchBranding().then((branding) => {
      if (branding) applyBranding(branding);
    });
  }, []);

  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
      </Route>
      <Route path="console/signup" element={<Signup />} />
      <Route
        path="console/onboarding"
        element={
          <AdminRoute>
            <Onboarding />
          </AdminRoute>
        }
      />
      <Route
        path="console"
        element={
          <ConsoleRoute>
            <OrgConsoleLayout />
          </ConsoleRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="settings" element={<OwnerRoute><ConsoleSettings /></OwnerRoute>} />
        <Route path="branding" element={<OwnerRoute><Branding /></OwnerRoute>} />
        <Route path="program" element={<ConsoleProgram />} />
        <Route path="talks" element={<ConsoleTalks />} />
        <Route path="speakers" element={<ConsoleSpeakers />} />
        <Route path="content" element={<ConsoleContent />} />
        <Route path="map" element={<ConsoleMap />} />
        <Route path="participants" element={<ConsoleParticipants />} />
        <Route path="checkin" element={<ConsoleCheckin />} />
        <Route path="moderation" element={<ConsoleModeration />} />
        <Route path="feedback" element={<ConsoleFeedback />} />
        <Route path="docs" element={<ConsoleDocs />} />
        <Route path="team" element={<ConsoleTeam />} />
        <Route path="billing" element={<OwnerRoute><ConsoleBilling /></OwnerRoute>} />
      </Route>
      <Route
        path="ops"
        element={
          <OpsRoute>
            <OpsLayout />
          </OpsRoute>
        }
      >
        <Route index element={<OpsDashboard />} />
        <Route path="tenants" element={<OpsTenants />} />
      </Route>
      {/* Публичный сайт вуза — единый shell-с-сайдбаром (редизайн), бренд per-tenant.
          Все витринные экраны под одним каркасом, чтобы переходы не «прыгали» на старый Layout. */}
      <Route path="/" element={<RootLayout />}>
        <Route index element={<EventLanding />} />
        <Route path="dashboard" element={<ProtectedRoute><EventDashboard /></ProtectedRoute>} />
        <Route path="documents" element={<ProtectedRoute><EventDocuments /></ProtectedRoute>} />
        <Route path="chat" element={<ProtectedRoute><EventChat /></ProtectedRoute>} />
        <Route path="schedule" element={<ProtectedRoute><EventSchedule /></ProtectedRoute>} />
        <Route path="profile" element={<ProtectedRoute><EventProfile /></ProtectedRoute>} />
        <Route path="feedback" element={<ProtectedRoute><EventFeedback /></ProtectedRoute>} />
        <Route path="map" element={<ProtectedRoute><EventMap /></ProtectedRoute>} />
        <Route path="program" element={<EventProgram />} />
        <Route path="sections" element={<EventSections />} />
        <Route path="sections/:id" element={<EventSectionDetail />} />
        <Route path="speakers" element={<EventSpeakers />} />
        <Route path="venue" element={<EventVenue />} />
        <Route path="live" element={<EventLive />} />
      </Route>
      {/* Служебные/второстепенные страницы — пока на прежнем Layout. */}
      <Route element={<Layout />}>
        <Route path="badge/:token" element={<BadgeCheckIn />} />
        <Route path="questions/:token" element={<QuestionPrompt />} />
        <Route path="questions/:token/approved" element={<ApprovedQuestions />} />
        <Route path="forbidden" element={<NoAccess />} />
        <Route path="legal" element={<Legal />} />
        <Route path="personal-data" element={<Legal initialDoc="privacy" />} />
        <Route path="consent-authors" element={<Legal initialDoc="consent" />} />
        <Route path="verify" element={<VerifyCertificate />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
