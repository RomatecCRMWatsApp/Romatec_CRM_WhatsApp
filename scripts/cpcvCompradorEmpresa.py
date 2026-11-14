"""
Modelos do CPCV (v3 e Planos A/B/C): comprador empresa (PJ) com os sócios.
- Qualificação: o parágrafo da pessoa física fica em {{#comp_pf}}; entra o bloco {{#comp_pj}} com a qualificação da empresa.
- Cabeçalho e assinatura: "CPF" vira {{comp_doc_rotulo}} (CPF ou CNPJ).
- Assinaturas: a linha do comprador PF fica em {{#comp_pf}}; na empresa, a razão social e uma linha por sócio ({{#comp_socios}}).
Idempotente: não mexe em modelo que já tem {{#comp_pj}}.
"""
import re, sys, zipfile, shutil, os

MARCA = '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:color w:val="990099"/><w:sz w:val="16"/></w:rPr><w:t>{{%s}}</w:t></w:r></w:p>'
FONTE = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>'
def run(t, b=False, azul=False, sz=None):
    rpr = FONTE + ('<w:b/>' if b else '<w:b w:val="0"/>') + ('<w:color w:val="1F4E9A"/>' if azul else '') + (f'<w:sz w:val="{sz}"/>' if sz else '')
    return f'<w:r><w:rPr>{rpr}</w:rPr><w:t xml:space="preserve">{t}</w:t></w:r>'

QUALIF_PJ = ('<w:p><w:pPr><w:jc w:val="both"/></w:pPr>' + run('PROMISSÁRIA COMPRADORA: ', b=True) + run('{{comp_nome}}', b=True, azul=True)
             + run(', ') + run('{{comp_qualificacao_pj}}', azul=True) + run(', doravante denominada COMPRADOR(A);') + '</w:p>')

def patch(xml: str) -> str:
    if '{{#comp_pj}}' in xml:
        return xml
    ps = re.findall(r'<w:p[ >].*?</w:p>', xml, flags=re.S)
    txt = [re.sub(r'<[^>]+>', '', p) for p in ps]
    # 1. Cabeçalho: " — CPF " antes de {{comp_cpf}}
    i7 = next(i for i, t in enumerate(txt) if t.startswith('{{comp_nome}} — CPF {{comp_cpf}}'))
    xml = xml.replace(ps[i7], ps[i7].replace('<w:t xml:space="preserve"> — CPF </w:t>', '<w:t xml:space="preserve"> — {{comp_doc_rotulo}} </w:t>'), 1)
    # 2. Qualificação
    iq = next(i for i, t in enumerate(txt) if t.startswith('PROMISSÁRIO(A) COMPRADOR(A): {{comp_nome}}'))
    xml = xml.replace(ps[iq], MARCA % '#comp_pf' + ps[iq] + MARCA % '/comp_pf' + MARCA % '#comp_pj' + QUALIF_PJ + MARCA % '/comp_pj', 1)
    # 3. Assinaturas: [espaço][traço][{{comp_nome}}][PROMISSÁRIO(A) COMPRADOR(A) — CPF {{comp_cpf}}]
    il = next(i for i, t in enumerate(txt) if t.startswith('PROMISSÁRIO(A) COMPRADOR(A) — CPF'))
    esp, traco, nome, rot = ps[il - 3], ps[il - 2], ps[il - 1], ps[il]
    assert '___' in txt[il - 2] and txt[il - 1] == '{{comp_nome}}', 'bloco de assinatura do comprador fora do esperado'
    rot_pf = rot.replace('<w:t xml:space="preserve">PROMISSÁRIO(A) COMPRADOR(A) — CPF </w:t>', '<w:t xml:space="preserve">PROMISSÁRIO(A) COMPRADOR(A) — {{comp_doc_rotulo}} </w:t>')
    empresa = (esp + nome
               + rot.replace('<w:t xml:space="preserve">PROMISSÁRIO(A) COMPRADOR(A) — CPF </w:t>', '<w:t xml:space="preserve">PROMISSÁRIA COMPRADORA — CNPJ </w:t>'))
    socio = (esp + traco + nome.replace('{{comp_nome}}', '{{nome}}')
             + rot.replace('<w:t xml:space="preserve">PROMISSÁRIO(A) COMPRADOR(A) — CPF </w:t>', '<w:t xml:space="preserve">SÓCIO(A) — ASSINA PELA COMPRADORA — CPF </w:t>').replace('{{comp_cpf}}', '{{cpf}}'))
    bloco = (MARCA % '#comp_pf' + esp + traco + nome + rot_pf + MARCA % '/comp_pf'
             + MARCA % '#comp_pj' + empresa + MARCA % '#comp_socios' + socio + MARCA % '/comp_socios' + MARCA % '/comp_pj')
    xml = xml.replace(esp + traco + nome + rot, bloco, 1)
    return xml

for f in sys.argv[1:]:
    z = zipfile.ZipFile(f)
    xml = z.read('word/document.xml').decode()
    novo = patch(xml)
    if novo == xml:
        print('já ajustado:', f); continue
    tmp = f + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
        for item in z.infolist():
            out.writestr(item, novo.encode() if item.filename == 'word/document.xml' else z.read(item.filename))
    z.close()
    shutil.move(tmp, f)
    print('ajustado:', f)
