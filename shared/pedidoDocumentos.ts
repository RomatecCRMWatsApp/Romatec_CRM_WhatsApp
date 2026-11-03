/**
 * Texto pronto para o corretor pedir ao cliente os documentos e dados do contrato (CPCV), na aba Contratos.
 * Segue os campos que o contrato pede (server/routers/contratos.router.ts → pessoaZ, dependenteZ e planoZ).
 */
export interface DadosPedido { nome?: string; chacara?: string; empreendimento?: string; corretor?: string }

export function textoPedidoDocumentos(d: DadosPedido = {}): string {
  const nome = d.nome?.trim() ? d.nome.trim().split(/\s+/)[0] : '';
  const ola = nome ? `Olá, ${nome}! Tudo bem?` : 'Olá! Tudo bem?';
  const chacara = d.chacara?.trim() ? ` da chácara ${d.chacara.trim().toUpperCase()}` : '';
  const emp = d.empreendimento?.trim() || 'Condomínio de Chácaras Bom Jardims';
  const assinatura = d.corretor?.trim() ? `\n\n${d.corretor.trim()}` : '';
  return `${ola} 😊

Para preparar o seu contrato${chacara} no ${emp}, preciso destes documentos e dados. Pode mandar foto legível por aqui mesmo:

📄 *Documentos (foto ou PDF)*
1. RG ou CNH (frente e verso)
2. CPF (se não estiver no RG/CNH)
3. Comprovante de residência dos últimos 90 dias
4. Certidão de nascimento (solteiro) ou de casamento (casado, separado, divorciado ou viúvo)

📝 *Dados*
5. Nome completo e data de nascimento
6. Nacionalidade e profissão
7. Estado civil. Se for casado ou em união estável: o regime de bens e, se tiver, o pacto antenupcial
8. Telefone (WhatsApp) e e-mail
9. Endereço completo com CEP

💍 *Se for casado ou em união estável*
10. RG ou CNH, CPF, profissão, telefone e e-mail do cônjuge (ele ou ela também assina o contrato)

💳 *Pagamento*
11. A forma de pagamento escolhida (à vista, entrada de 30% ou plano A, B ou C)
12. O melhor dia para o vencimento das parcelas

👨‍👩‍👧 *Opcional: dependentes que vão frequentar o condomínio* (para as carteirinhas de acesso)
13. Nome, parentesco, CPF, data de nascimento, telefone e e-mail de cada um

Assim que eu receber, preparo a minuta e te mando para conferir antes da assinatura, que é toda digital, pelo celular.

🔒 Seus dados são usados só para o contrato e o cadastro no condomínio (LGPD).${assinatura}`;
}
