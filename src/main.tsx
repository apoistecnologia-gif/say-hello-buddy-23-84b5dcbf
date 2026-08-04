import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter, createHashHistory } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import './styles.css'

console.info("APOIS_BUILD_TESTE_2026_08_04_1202");
console.info("[APOIS] main.tsx iniciado");

const queryClient = new QueryClient()
const hashHistory = createHashHistory()

const router = createRouter({
  routeTree,
  history: hashHistory,
  context: {
    queryClient,
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')
console.info("[APOIS] root encontrado", !!rootElement);

if (rootElement) {
  console.info("[APOIS] React montando v2");
  rootElement.innerHTML = "<h1>REACT OVERRIDE TEST</h1>";
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>
  )
  console.info("[APOIS] Render chamado");
} else {
  console.error("[APOIS] Erro: Elemento #root não encontrado");
}
