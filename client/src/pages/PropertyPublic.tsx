import { useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";

export default function PropertyPublic() {
  const [, params] = useRoute("/imovel/:slug");
  const slug = params?.slug || "";
  const { data: property, isLoading } = trpc.properties.getBySlug.useQuery({ slug }, { enabled: !!slug });
  
  if (isLoading) return <div style={{color:"white",padding:20}}>Carregando...</div>;
  if (!property) return <div style={{color:"white",padding:20}}>Imovel nao encontrado</div>;
  
  return (
    <div style={{color:"white",padding:20}}>
      <h1>{property.denomination}</h1>
      <p>{property.address}</p>
    </div>
  );
}