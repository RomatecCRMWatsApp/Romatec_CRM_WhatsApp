/** Capa do vídeo: a arte oficial do Bom Jardims; nos demais, o 1º segundo do próprio vídeo no Cloudinary */
export const capaDoVideo = (url?: string | null, empreendimentoSlug?: string | null): string | undefined => {
  if (empreendimentoSlug === "bom-jardims") return "/bom-jardims/capa-video.jpg";
  if (!url || !url.includes("/video/upload/")) return undefined;
  return url.replace("/video/upload/", "/video/upload/so_1,c_limit,w_960,q_auto,f_jpg/").replace(/\.(mp4|mov|webm)(\?.*)?$/i, ".jpg");
};
