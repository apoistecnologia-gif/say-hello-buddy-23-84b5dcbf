import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter, createHashHistory } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import './styles.css'

const queryClient = new QueryClient()
const hashHistory = createHashHistory()

const router = createRouter({
  routeTree,
  history: hashHistory,
  context: {
    queryClient,
  },
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

console.info("APOIS_BUILD_TESTE_2026_08_04_1202");
console.info("[APOIS] main.tsx iniciado");
const rootElement = document.getElementById('root')!
console.info("[APOIS] root encontrado", !!rootElement);
if (!rootElement.innerHTML) {
  try {
    const root = ReactDOM.createRoot(rootElement)
    console.info("[APOIS] React montando");
    console.info("[APOIS] rootElement innerHTML antes:", rootElement.innerHTML);
    root.render(
      <React.StrictMode>
        <div style={{ position: 'fixed', top: 50, right: 10, background: 'blue', color: 'white', padding: '10px', zIndex: 10000 }}>
          DEBUG REACT MOUNTED
        </div>
        <RouterProvider router={router} />
      </React.StrictMode>,
    )
    console.info("[APOIS] Render chamado");
  } catch (error) {
    console.error('Critical Render Error:', error)
    rootElement.innerHTML = `
      <div style="padding: 20px; background: black; color: white; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; font-family: sans-serif;">
        <h1 style="color: #FFB800;">Erro de Inicialização</h1>
        <p>Ocorreu um problema ao carregar o aplicativo.</p>
        <button onclick="window.location.reload()" style="margin-top: 20px; background: #FFB800; color: black; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">Tentar Novamente</button>
      </div>
    `
  }
}
