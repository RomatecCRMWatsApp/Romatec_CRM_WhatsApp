"""
Prospecção B2B: lista empresas-alvo (imobiliárias, correspondentes bancários, engenharia/topografia, construtoras,
cartórios, bancos e advocacia) a partir do Overture Maps (places, licença aberta CDLA/ODbL) e grava um CSV no formato
que o CRM importa em Vendas › Prospecção B2B › Importar.

Uso:  python3 -I scripts/prospeccao/overture_lugares.py [saida.csv] [release]
Requer: pip install fsspec aiohttp pyarrow shapely
"""
import csv, json, re, sys, time, unicodedata, urllib.request, concurrent.futures as cf
import fsspec, pyarrow.parquet as pq, shapely

BASE = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com'
RELEASE = sys.argv[2] if len(sys.argv) > 2 else '2026-10-21.0'
SAIDA = sys.argv[1] if len(sys.argv) > 1 else 'prospectos_regiao.csv'
# (cidade, xmin, xmax, ymin, ymax): Açailândia e cidades a até ~100 km
REGIOES = [
    ('Açailândia', -47.56, -47.34, -5.02, -4.86),
    ('Imperatriz', -47.56, -47.38, -5.62, -5.44),
    ('João Lisboa', -47.43, -47.36, -5.48, -5.41),
    ('Cidelândia', -47.80, -47.74, -5.20, -5.14),
    ('Itinga do Maranhão', -47.54, -47.48, -4.48, -4.42),
    ('São Francisco do Brejão', -47.42, -47.36, -5.16, -5.10),
    ('Buriticupu', -46.48, -46.40, -4.36, -4.28),
]
X0 = min(r[1] for r in REGIOES); X1 = max(r[2] for r in REGIOES); Y0 = min(r[3] for r in REGIOES); Y1 = max(r[4] for r in REGIOES)

def norm(s):
    return unicodedata.normalize('NFD', (s or '').lower()).encode('ascii', 'ignore').decode()

# Ordem importa: a primeira regra que casar define a categoria
REGRAS = [
    ('correspondente', r'correspondente|caixa aqui'),
    ('imobiliaria', r'imobiliar|imoveis|imovel|corretor de imo|corretora de imo|real_estate|negocios imob|consultoria imob'),
    ('engenharia', r'engenharia|engenheir|arquitet|topograf|agrimensur|georreferenc|surveying|architect|engineering|avaliac'),
    ('construtora', r'construtora|construcoes|incorporad|loteadora|loteamento|empreendimentos|construction_company|home_developer|general_contractor'),
    ('cartorio', r'cartorio|tabelionato|oficio extrajudicial|registro de imoveis|notary'),
    ('banco', r'\bbanco\b|caixa economica|sicredi|sicoob|bank|credit_union'),
    ('advocacia', r'advocacia|advogad|lawyer|law_firm|attorney'),
]
EXCLUIR = r'materia(l|is) de constru|home center|tapecaria|refrigera|autopec|reformas de bancos|bancos de|loja|deposito|madeireira|ferragens'

def categoria(nome, tax):
    t = norm(nome) + ' ' + norm(tax)
    if re.search(EXCLUIR, t):
        return None
    for cat, rx in REGRAS:
        if re.search(rx, t):
            return cat
    return None

def cidade_de(x, y):
    for nome, a, b, c, d in REGIOES:
        if a <= x <= b and c <= y <= d:
            return nome
    return None

def grupos(fs, k):
    with fs.open(f'{BASE}/{k}', block_size=2**20) as f:
        md = pq.ParquetFile(f).metadata
        ix = {md.schema.column(i).path: i for i in range(md.num_columns)}
        hits = []
        for g in range(md.num_row_groups):
            rg = md.row_group(g)
            def st(c):
                s = rg.column(ix[c]).statistics
                return (s.min, s.max) if s is not None and s.has_min_max else (None, None)
            a, b, c, d = st('bbox.xmin')[0], st('bbox.xmax')[1], st('bbox.ymin')[0], st('bbox.ymax')[1]
            if None in (a, b, c, d):
                continue
            if any(a <= r[2] and b >= r[1] and c <= r[4] and d >= r[3] for r in REGIOES):
                hits.append(g)
        return k, hits

def ler(fs, k, gs):
    out = []
    cols = ['id', 'names', 'taxonomy', 'geometry', 'bbox', 'addresses', 'phones', 'websites', 'socials', 'emails', 'confidence', 'operating_status']
    with fs.open(f'{BASE}/{k}', block_size=2**22) as f:
        pf = pq.ParquetFile(f)
        cols = [c for c in cols if c in pf.schema_arrow.names]
        for g in gs:
            for r in pf.read_row_group(g, columns=cols).to_pylist():
                b = r['bbox']
                if b['xmax'] < X0 or b['xmin'] > X1 or b['ymax'] < Y0 or b['ymin'] > Y1:
                    continue
                if (r.get('operating_status') or 'open') != 'open':
                    continue
                p = shapely.from_wkb(r['geometry'])
                cid = cidade_de(p.x, p.y)
                if not cid:
                    continue
                nome = ((r.get('names') or {}).get('primary') or '').strip()
                tax = (r.get('taxonomy') or {}).get('primary') or ''
                cat = categoria(nome, tax)
                if not nome or not cat:
                    continue
                webs = r.get('websites') or []
                soc = (r.get('socials') or []) + webs
                insta = next((s for s in soc if 'instagram.com' in s), '')
                site = next((w for w in webs if 'instagram.com' not in w and 'facebook.com' not in w), '')
                end = (r.get('addresses') or [{}])[0] or {}
                out.append({
                    'nome': nome, 'categoria': cat, 'cidade': cid, 'uf': 'MA',
                    'telefone': (r.get('phones') or [''])[0], 'email': (r.get('emails') or [''])[0],
                    'site': site, 'instagram': insta, 'endereco': end.get('freeform') or '',
                    'lat': round(p.y, 6), 'lng': round(p.x, 6), 'fonte': 'overture', 'fonteId': r['id'],
                })
    return out

def main():
    t = time.time()
    pfx = f'release/{RELEASE}/theme=places/type=place/'
    keys = re.findall(r'<Key>([^<]*)</Key>', urllib.request.urlopen(f'{BASE}/?list-type=2&prefix={pfx}', timeout=30).read().decode())
    if not keys:
        sys.exit(f'Nenhum arquivo em {pfx} (confira o release)')
    fs = fsspec.filesystem('http')
    with cf.ThreadPoolExecutor(16) as ex:
        res = [r for r in ex.map(lambda k: grupos(fs, k), keys) if r[1]]
    linhas = []
    with cf.ThreadPoolExecutor(8) as ex:
        for parte in ex.map(lambda kg: ler(fs, *kg), res):
            linhas.extend(parte)
    vistos, unicos = set(), []
    for l in sorted(linhas, key=lambda l: (l['cidade'], l['categoria'], l['nome'])):
        chave = (norm(l['nome']), l['cidade'])
        if chave in vistos:
            continue
        vistos.add(chave)
        unicos.append(l)
    with open(SAIDA, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(unicos[0].keys()) if unicos else ['nome'])
        w.writeheader()
        w.writerows(unicos)
    resumo = {}
    for l in unicos:
        resumo[l['categoria']] = resumo.get(l['categoria'], 0) + 1
    print(json.dumps({'arquivo': SAIDA, 'total': len(unicos), 'por_categoria': resumo, 'segundos': round(time.time() - t)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
