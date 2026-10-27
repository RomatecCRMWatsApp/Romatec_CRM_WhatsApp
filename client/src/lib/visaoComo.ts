import { createContext, useContext } from "react";

/**
 * "Ver como": o administrador abre a tela de outro perfil (ex.: Visão do corretor) e ela se comporta como para ele —
 * por exemplo, o painel da chácara fica só leitura. Só muda a tela; o servidor continua conferindo o perfil real.
 */
export const VisaoComo = createContext<"corretor" | null>(null);
export const useVisaoComo = () => useContext(VisaoComo);
