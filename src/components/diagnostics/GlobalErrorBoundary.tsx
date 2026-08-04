import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    window.location.href = "/";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black p-8 text-center text-white">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
            <AlertTriangle className="text-red-500" size={40} />
          </div>
          
          <h1 className="text-2xl font-black mb-2">Ops! Algo deu errado</h1>
          <p className="text-zinc-400 text-sm font-medium mb-8 max-w-xs">
            Ocorreu um erro inesperado na inicialização do aplicativo.
          </p>

          <div className="w-full bg-zinc-900/50 rounded-2xl p-4 mb-8 text-left overflow-auto max-h-[200px] border border-white/5">
            <p className="text-[10px] font-mono text-red-400 break-words">
              {this.state.error?.toString()}
            </p>
            {this.state.errorInfo && (
              <p className="text-[10px] font-mono text-zinc-600 mt-2 whitespace-pre-wrap">
                {this.state.errorInfo.componentStack}
              </p>
            )}
          </div>

          <Button 
            onClick={handleReset}
            className="bg-apois-yellow text-black font-black w-full h-14 rounded-2xl flex items-center justify-center gap-2"
          >
            <RefreshCcw size={18} />
            Recarregar Aplicativo
          </Button>
          
          <p className="mt-8 text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
            Diagnóstico APOIS v1.0
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
