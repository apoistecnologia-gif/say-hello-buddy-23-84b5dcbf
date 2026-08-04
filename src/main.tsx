import React from "react";
import ReactDOM from "react-dom/client";

console.info("APOIS_MAIN_INICIADO");

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento #root não encontrado");
}

ReactDOM.createRoot(rootElement).render(
  <div style={{ 
    height: '100vh', 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', 
    background: 'black', 
    color: '#FFB800',
    fontSize: '24px',
    fontWeight: 'bold',
    fontFamily: 'sans-serif'
  }}>
    APOIS REACT MONTOU
  </div>
);
