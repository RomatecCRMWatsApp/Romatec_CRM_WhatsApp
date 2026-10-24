/**
 * Assinatura ICP-Brasil A1 (spec §6.5) e leitura da assinatura gov.br (§6.6).
 * Regra do certificado: o sistema NUNCA guarda o .pfx nem a senha — assina em memória e zera o buffer.
 * A assinatura é INCREMENTAL (placeholder-plain acrescenta ao fim do arquivo): os bytes anteriores ficam intactos e
 * as assinaturas já feitas continuam válidas — conferido byte a byte depois de assinar.
 */
import forge from 'node-forge';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';

export class CertificadoInvalidoError extends Error {}

export interface InfoCertificado {
  nome: string;
  cpf: string | null;
  emissor: string;
  serial: string;
  validade: Date;
  icpBrasil: boolean;
}

const campo = (attrs: forge.pki.Certificate['subject'], nome: string) => String(attrs.getField(nome)?.value ?? '');

/** CPF do titular: SAN otherName 2.16.76.1.3.1 (nascimento 8 + CPF 11 + …) ou CN "NOME:CPF" */
export function cpfDoCertificado(cert: forge.pki.Certificate): string | null {
  const san: any = cert.getExtension('subjectAltName');
  const bruto = String(san?.value ?? '');
  const oid = forge.asn1.oidToDer('2.16.76.1.3.1').getBytes();
  const i = bruto.indexOf(oid);
  if (i >= 0) {
    const m = bruto.slice(i + oid.length, i + oid.length + 80).match(/\d{8}(\d{11})/);
    if (m) return m[1];
  }
  const cn = campo(cert.subject, 'CN');
  return cn.match(/:(\d{11})$/)?.[1] ?? cn.match(/(\d{11})$/)?.[1] ?? null;
}

function info(cert: forge.pki.Certificate, cadeia: forge.pki.Certificate[]): InfoCertificado {
  const cn = campo(cert.subject, 'CN');
  return {
    nome: cn.split(':')[0].trim(),
    cpf: cpfDoCertificado(cert),
    emissor: campo(cert.issuer, 'CN') || cert.issuer.attributes.map(a => `${a.shortName}=${a.value}`).join(', '),
    serial: cert.serialNumber,
    validade: cert.validity.notAfter,
    icpBrasil: [cert, ...cadeia].some(c => /ICP-Brasil/i.test(campo(c.subject, 'O')) || /ICP-Brasil/i.test(campo(c.issuer, 'O'))),
  };
}

/** Abre o .pfx (só para conferir titular, validade e ICP-Brasil) — não guarda nada */
export function lerCertificado(pfx: Buffer, senha: string, agora = new Date()): InfoCertificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary'))), false, senha);
  } catch {
    throw new CertificadoInvalidoError('Senha incorreta ou arquivo .pfx inválido');
  }
  const oids = forge.pki.oids;
  const chave = [...(p12.getBags({ bagType: oids.pkcs8ShroudedKeyBag })[oids.pkcs8ShroudedKeyBag] ?? []), ...(p12.getBags({ bagType: oids.keyBag })[oids.keyBag] ?? [])]
    .find(b => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  const certs = (p12.getBags({ bagType: oids.certBag })[oids.certBag] ?? []).map(b => b.cert).filter((c): c is forge.pki.Certificate => !!c);
  const folha = chave ? certs.find(c => (c.publicKey as forge.pki.rsa.PublicKey).n.equals(chave.n)) : certs[0];
  if (!folha) throw new CertificadoInvalidoError('Certificado não encontrado no arquivo');
  if (agora < folha.validity.notBefore || agora > folha.validity.notAfter) throw new CertificadoInvalidoError('Certificado fora da validade');
  const i = info(folha, certs.filter(c => c !== folha));
  if (!i.icpBrasil) throw new CertificadoInvalidoError('O certificado não é da ICP-Brasil');
  return i;
}

/** PDF já tem assinatura digital? (depois disso, nada de regravar o arquivo inteiro) */
export const temAssinaturaDigital = (pdf: Buffer) => pdf.includes(Buffer.from('/ByteRange'));

/** Assina incrementalmente com o A1 do próprio signatário; zera o .pfx da memória em qualquer caso */
export async function assinarICP(pdf: Buffer, pfx: Buffer, senha: string, o: { motivo: string; nome: string; local?: string; contato?: string }): Promise<Buffer> {
  try {
    const comPlaceholder = plainAddPlaceholder({
      pdfBuffer: pdf, reason: o.motivo, contactInfo: o.contato ?? 'romateccrm@gmail.com', name: o.nome, location: o.local ?? 'Açailândia/MA',
      signatureLength: 16384,
    });
    const assinado = await new SignPdf().sign(comPlaceholder, new P12Signer(pfx, { passphrase: senha }));
    if (!assinado.subarray(0, pdf.length).equals(pdf)) throw new Error('Assinatura não incremental — abortado para preservar as assinaturas anteriores');
    return assinado;
  } finally {
    pfx.fill(0);
  }
}

/**
 * Última assinatura de um PDF (gov.br): lê o último /ByteRange e o /Contents, abre o PKCS#7 e devolve o certificado do signatário.
 * Nos certificados gov.br o CN vem como "NOME:CPF"; sem CPF, a conferência é pelo nome (revisão manual).
 */
export function extrairUltimaAssinatura(pdf: Buffer): (InfoCertificado & { cobreAteOFim: boolean }) | null {
  const texto = pdf.toString('latin1');
  const i = texto.lastIndexOf('/ByteRange');
  if (i < 0) return null;
  const br = texto.slice(i, i + 120).match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
  if (!br) return null;
  const [a, b, c, d] = br.slice(1).map(Number);
  const hex = texto.slice(a + b, c).replace(/[<>\s]/g, '').replace(/(00)+$/, '');
  if (!hex) return null;
  try {
    const msg: any = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.hexToBytes(hex), { strict: false } as any));
    const certs: forge.pki.Certificate[] = msg.certificates ?? [];
    const signerSerial = msg.rawCapture?.serial ? forge.util.bytesToHex(msg.rawCapture.serial) : null;
    const cert = certs.find(x => signerSerial && x.serialNumber.toLowerCase().replace(/^0+/, '') === signerSerial.toLowerCase().replace(/^0+/, ''))
      ?? certs.find(x => !(x.getExtension('basicConstraints') as any)?.cA) ?? certs[0];
    if (!cert) return null;
    return { ...info(cert, certs.filter(x => x !== cert)), cobreAteOFim: c + d === pdf.length || c + d >= pdf.length - 2 };
  } catch {
    return null;
  }
}

export const normalizarNome = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
