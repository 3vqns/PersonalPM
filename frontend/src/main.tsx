import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { AuthProvider } from "./providers/AuthProvider";
import { AppRouter } from "./app/router";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppErrorBoundary>
          <AppRouter />
        </AppErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
