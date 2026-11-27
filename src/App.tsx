import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ContentProvider } from "./lib/ContentContext";
import { HomePage } from "./pages/HomePage";
import { AdminPage } from "./pages/AdminPage";
import { CalculatorPage } from "./pages/CalculatorPage";
import { MeCallbackPage } from "./pages/MeCallbackPage";
import { ErpLoginPage } from "./pages/erp/ErpLoginPage";
import { ErpShell } from "./pages/erp/ErpShell";

export default function App() {
  return (
    <ContentProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/calculadora" element={<CalculatorPage />} />
          <Route path="/admin/me-callback" element={<MeCallbackPage />} />
          <Route path="/erp/login" element={<ErpLoginPage />} />
          <Route path="/erp/*" element={<ErpShell />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ContentProvider>
  );
}
