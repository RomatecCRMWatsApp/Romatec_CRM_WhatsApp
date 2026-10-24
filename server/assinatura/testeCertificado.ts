/**
 * Certificado A1 de TESTE (autoassinado, imitando o formato ICP-Brasil: O=ICP-Brasil, CN "NOME:CPF", SAN 2.16.76.1.3.1).
 * Só para os testes automatizados — não vale como certificado real.
 */
import forge from 'node-forge';

export function pfxDeTeste(o: { nome: string; cpf: string; senha: string; icp?: boolean; validoAte?: Date }): Buffer {
  const chaves = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = String(Math.floor(Math.random() * 1e12)).padStart(12, '1');
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = o.validoAte ?? new Date(Date.now() + 365 * 86_400_000);
  const nome = [{ name: 'commonName', value: `${o.nome}:${o.cpf}` }, { name: 'organizationName', value: o.icp === false ? 'Outra AC' : 'ICP-Brasil' }, { name: 'countryName', value: 'BR' }];
  cert.setSubject(nome);
  cert.setIssuer([{ name: 'commonName', value: 'AC TESTE' }, { name: 'organizationName', value: o.icp === false ? 'Outra AC' : 'ICP-Brasil' }, { name: 'countryName', value: 'BR' }]);
  // otherName 2.16.76.1.3.1: nascimento (8) + CPF (11) + NIS (11) + RG…
  const otherName = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer('2.16.76.1.3.1').getBytes()),
    forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, `01011980${o.cpf}00000000000`),
    ]),
  ]);
  const sanValor = forge.asn1.toDer(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [otherName])).getBytes();
  cert.setExtensions([{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true, nonRepudiation: true }, { id: '2.5.29.17', value: sanValor }]);
  cert.sign(chaves.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], o.senha, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}
