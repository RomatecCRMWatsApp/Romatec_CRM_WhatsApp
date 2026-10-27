import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";
import { sairVerComo, verComoAtual } from "@/lib/verComo";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } =
    options ?? {};

  const utils = trpc.useUtils();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
    },
  });

  // Sair: apaga o cookie (espera no máximo 3 s) e recarrega direto no login — sem a tela ficar de pé, vazia, refazendo consultas
  const logout = useCallback(async () => {
    // No "ver como" do administrador, o botão Sair da pessoa só encerra a visualização (o administrador continua logado)
    if (verComoAtual()) { sairVerComo(); return; }
    try {
      await Promise.race([logoutMutation.mutateAsync(), new Promise(r => setTimeout(r, 3000))]);
    } catch { /* sessão já encerrada ou rede: segue para o login */ }
    utils.auth.me.setData(undefined, null);
    window.location.replace("/login");
  }, [logoutMutation, utils]);

  /** null = entrou; string = mensagem de erro do servidor (senha errada, muitas tentativas...) */
  const login = useCallback(async (username: string, password: string): Promise<string | null> => {
    try {
      await loginMutation.mutateAsync({ username, password });
      return null;
    } catch (error: unknown) {
      return error instanceof TRPCClientError && error.message ? error.message : "Usuário ou senha incorretos.";
    }
  }, [loginMutation]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;
    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
    login,
  };
}
