/** Capa do vídeo: a arte oficial do Bom Jardims; nos demais, o 1º segundo do próprio vídeo no Cloudinary */
export const capaDoVideo = (url?: string | null, empreendimentoSlug?: string | null): string | undefined => {
  if (empreendimentoSlug === "bom-jardims") return "/bom-jardims/capa-video.jpg";
  if (!url || !url.includes("/video/upload/")) return undefined;
  return url.replace("/video/upload/", "/video/upload/so_1,c_limit,w_960,q_auto,f_jpg/").replace(/\.(mp4|mov|webm)(\?.*)?$/i, ".jpg");
};

/** Endereço para assistir: no Cloudinary com qualidade e codec automáticos; fora dele, o arquivo como está */
export const enderecoParaAssistir = (url: string): string =>
  url.includes("/video/upload/") && !/\/video\/upload\/[^/]*q_auto/.test(url)
    ? url.replace("/video/upload/", "/video/upload/q_auto,vc_auto/")
    : url;
