import { useState } from "react";
import { useRoute } from "wouter";
import { Loader2, Video } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ChamadaJitsi, { type EntradaSala } from "@/components/salaVideo/ChamadaJitsi";
import { C, SANS, SERIF, useBrandFonts } from "@/components/bom-jardims/marca";

/** Convidado da sala de vídeo: digita o nome e entra (sem login, sem instalar nada). */
export default function SalaVideoPublica() {
  useBrandFonts();
  const [, p] = useRoute("/sala/:codigo");
  const codigo = p?.codigo ?? "";
  const { data, isLoading, error } = trpc.salaVideo.publica.useQuery({ codigo }, { enabled: codigo.length >= 10, retry: false });
  const [nome, setNome] = useState(() => { try { return localStorage.getItem("romatec-sala-nome") ?? ""; } catch { return ""; } });
  const [entrada, setEntrada] = useState<EntradaSala | null>(null);
  const [saiu, setSaiu] = useState(false);
  const entrar = trpc.salaVideo.entrarConvidado.useMutation({
    onSuccess: e => {
      try { localStorage.setItem("romatec-sala-nome", nome.trim()); } catch { /* */ }
      const en = e as EntradaSala;
      if (en.modo === "aba" && en.url) window.location.href = en.url; else setEntrada(en);
    },
  });

  if (entrada) {
    return (
      <div style={{ minHeight: "100dvh", background: "#000", padding: 8, boxSizing: "border-box" }}>
        <ChamadaJitsi entrada={entrada} altura="calc(100dvh - 16px)" onSair={() => { setEntrada(null); setSaiu(true); }} />
      </div>
    );
  }

  const caixa: React.CSSProperties = { maxWidth: 440, margin: "0 auto", background: "#fff", borderRadius: 18, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,.15)" };
  return (
    <div style={{ minHeight: "100dvh", background: C.verde, padding: "40px 16px", boxSizing: "border-box", fontFamily: SANS, color: C.texto }}>
      <div style={caixa}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Video size={26} color={C.verde} />
          <span style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: C.verde }}>Reunião por vídeo</span>
        </div>
        {isLoading ? <p><Loader2 size={18} className="animate-spin" /> Carregando…</p> : error || !data ? (
          <p style={{ fontSize: 16 }}>Esta sala não existe ou o link está incompleto. Peça o link de novo a quem convidou.</p>
        ) : data.encerrada ? (
          <p style={{ fontSize: 16 }}>Esta reunião já foi encerrada.</p>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (nome.trim().length >= 2) entrar.mutate({ codigo, nome: nome.trim() }); }}>
            <p style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>{data.titulo}</p>
            {data.anfitriao && <p style={{ margin: "0 0 16px", fontSize: 15, color: "#555" }}>Com {data.anfitriao}</p>}
            {saiu && <p style={{ margin: "0 0 12px", fontSize: 14, color: C.verde }}>Você saiu da reunião. Para voltar, toque em Entrar.</p>}
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 6 }} htmlFor="nome">Seu nome</label>
            <input id="nome" value={nome} onChange={e => setNome(e.target.value)} maxLength={60} autoComplete="name" placeholder="Como você quer aparecer na chamada"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: "1px solid #D8CFB4", fontSize: 16 }} />
            {entrar.error && <p style={{ color: "#b42318", fontSize: 14 }}>{entrar.error.message}</p>}
            <button type="submit" disabled={entrar.isPending || nome.trim().length < 2}
              style={{ marginTop: 14, width: "100%", padding: "14px 16px", borderRadius: 12, border: "none", background: C.verde, color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer", opacity: nome.trim().length < 2 ? 0.6 : 1 }}>
              {entrar.isPending ? "Entrando…" : "Entrar na reunião"}
            </button>
            <p style={{ marginTop: 12, fontSize: 13, color: "#666" }}>Funciona no celular e no computador, pelo navegador. Permita o uso da câmera e do microfone quando o navegador pedir.</p>
          </form>
        )}
      </div>
    </div>
  );
}
