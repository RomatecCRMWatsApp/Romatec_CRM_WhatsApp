import { describe, it, expect } from "vitest";
import { capaDoVideo, enderecoParaAssistir } from "../client/src/lib/capaVideo";

describe("capaDoVideo", () => {
  it("usa a arte oficial nos vídeos do Bom Jardims", () => {
    expect(capaDoVideo("https://res.cloudinary.com/x/video/upload/v1/a.mp4", "bom-jardims")).toBe("/bom-jardims/capa-video.jpg");
  });
  it("tira o quadro do 1º segundo nos vídeos do Cloudinary", () => {
    expect(capaDoVideo("https://res.cloudinary.com/x/video/upload/v1/pasta/a.mp4")).toBe("https://res.cloudinary.com/x/video/upload/so_1,c_limit,w_960,q_auto,f_jpg/v1/pasta/a.jpg");
  });
  it("não inventa capa para vídeo fora do Cloudinary", () => {
    expect(capaDoVideo("https://exemplo.com/a.mp4")).toBeUndefined();
    expect(capaDoVideo(null)).toBeUndefined();
  });
});

describe("enderecoParaAssistir", () => {
  it("toca o vídeo do Cloudinary com qualidade automática (mais leve no celular)", () => {
    expect(enderecoParaAssistir("https://res.cloudinary.com/x/video/upload/v1/a.mp4")).toBe("https://res.cloudinary.com/x/video/upload/q_auto,vc_auto/v1/a.mp4");
  });
  it("não repete a transformação nem mexe em vídeo de fora", () => {
    const ja = "https://res.cloudinary.com/x/video/upload/q_auto,vc_auto/v1/a.mp4";
    expect(enderecoParaAssistir(ja)).toBe(ja);
    expect(enderecoParaAssistir("https://romateccrm.com/bom-jardims/ig/a.mp4")).toBe("https://romateccrm.com/bom-jardims/ig/a.mp4");
  });
});
