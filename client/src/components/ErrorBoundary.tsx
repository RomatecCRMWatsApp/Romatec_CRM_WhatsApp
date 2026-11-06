import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";
import { ehErroDeVersao, recarregarUmaVez } from "@/lib/recarregarVersao";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** Erro de versão antiga (pedaço do sistema que não existe mais): recarregando para a nova */
  atualizando?: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    if (ehErroDeVersao(error) && recarregarUmaVez()) this.setState({ atualizando: true });
  }

  render() {
    if (this.state.hasError && this.state.atualizando) {
      return (
        <div role="status" className="flex min-h-screen items-center justify-center bg-background p-8">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><RotateCcw size={16} className="animate-spin motion-reduce:animate-none" /> Atualizando para a versão nova…</p>
        </div>
      );
    }
    if (this.state.hasError) {
      const deVersao = ehErroDeVersao(this.state.error);
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">{deVersao ? "Saiu uma versão nova do sistema." : "Algo deu errado nesta tela."}</h2>
            <p className="mb-4 text-sm text-muted-foreground">{deVersao ? "Toque em Recarregar para abrir a versão atualizada." : "Toque em Recarregar. Se continuar, mande um print desta tela para o suporte."}</p>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
