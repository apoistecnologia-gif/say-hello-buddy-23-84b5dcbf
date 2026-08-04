import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { getRouter } from "./router";
import "./styles.css";

console.log("[main.tsx] Script started");

const rootElement = document.getElementById("root");

if (!rootElement) {
  console.error("[main.tsx] Root element not found");
  document.body.innerHTML = '<div style="color:white; background:red; padding:20px;">ERRO CRÍTICO: Elemento #root não encontrado.</div>';
} else {
  console.log("[main.tsx] Root element found, initializing...");
  
  try {
    const router = getRouter();
    const root = createRoot(rootElement);
    
    // Wrap in a minimal error check for createRoot/render
    root.render(
      <StrictMode>
        <RouterProvider 
          router={router} 
          defaultNotFoundComponent={() => (
            <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-6">
              <h1 className="text-xl font-bold mb-4">Página não encontrada</h1>
              <a href="/" className="bg-apois-yellow text-black px-6 py-3 rounded-xl font-bold">Voltar para o Início</a>
            </div>
          )}
        />
      </StrictMode>
    );
    console.log("[main.tsx] React render called");
  } catch (err) {
    console.error("[main.tsx] Error during initialization:", err);
    rootElement.innerHTML = `
      <div style="color:white; background:#111; padding:40px; font-family:sans-serif; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
        <h1 style="color:#FFB800;">Erro na Inicialização</h1>
        <p>O aplicativo não conseguiu iniciar corretamente.</p>
        <pre style="background:#222; padding:20px; border-radius:10px; font-size:12px; text-align:left; max-width:90vw; overflow:auto;">${err}</pre>
        <button onclick="window.location.reload()" style="background:#FFB800; color:black; border:none; padding:15px 30px; border-radius:10px; font-weight:bold; margin-top:20px;">Tentar Novamente</button>
      </div>
    `;
  }
}
