import React from "react";
import ReactDOM from "react-dom/client";
import './styles.css'

console.info("APOIS_MAIN_INICIADO");

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento #root não encontrado");
}

ReactDOM.createRoot(rootElement).render(
  <div className="min-h-screen flex items-center justify-center bg-black">
    <div className="text-[#FFB800] text-2xl font-bold uppercase tracking-widest animate-pulse">
      APOIS REACT MONTOU + CSS
    </div>
  </div>
);

