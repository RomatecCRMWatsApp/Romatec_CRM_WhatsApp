import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { argumentosConversao, converterParaWhatsApp } from "./tour3dConversao";

// Tour 3D: o WhatsApp descarta áudio Opus em MP4 — o servidor regrava o som em AAC sem mexer na imagem.

const temFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

describe("tour 3D — ajuste do vídeo para o WhatsApp", () => {
  it("MP4: copia a imagem e regrava só o áudio em AAC", () => {
    const a = argumentosConversao("in.mp4", "out.mp4", false);
    expect(a.join(" ")).toContain("-c:v copy");
    expect(a.join(" ")).toContain("-c:a aac");
    expect(a.join(" ")).toContain("+faststart");
  });

  it("WebM: converte a imagem para H.264", () => {
    expect(argumentosConversao("in.webm", "out.mp4", true).join(" ")).toContain("-c:v libx264");
  });

  it("recusa arquivo vazio, grande demais ou de outro tipo", async () => {
    await expect(converterParaWhatsApp(Buffer.alloc(0), "video/mp4")).rejects.toMatchObject({ status: 400 });
    await expect(converterParaWhatsApp(Buffer.from("x"), "image/png")).rejects.toMatchObject({ status: 400 });
  });

  it.skipIf(!temFfmpeg)("vídeo com áudio Opus sai com áudio AAC e a mesma imagem", async () => {
    const pasta = mkdtempSync(path.join(os.tmpdir(), "t3d-teste-"));
    try {
      const origem = path.join(pasta, "opus.mp4");
      const r = spawnSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=green:s=320x568:d=1:r=30",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=1:sample_rate=48000",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "libopus", "-shortest", origem,
      ]);
      expect(r.status).toBe(0);
      const saida = await converterParaWhatsApp(readFileSync(origem), "video/mp4");
      const destino = path.join(pasta, "saida.mp4");
      writeFileSync(destino, saida);
      const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "csv=p=0", destino], { encoding: "utf8" });
      expect(p.stdout).toContain("h264,video");
      expect(p.stdout).toContain("aac,audio");
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});
