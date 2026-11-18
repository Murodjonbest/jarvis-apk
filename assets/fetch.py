# Poly Haven (CC0) dan Jarvis Loyiha kutubxonasini yuklab olish
import json, os, sys, urllib.request, shutil
OUT = sys.argv[1]
UA = {'User-Agent': 'jarvis-loyiha-assets'}
def get(u): return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60))
def dl(u, p):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if os.path.exists(p): return
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=180) as r, open(p, 'wb') as f: shutil.copyfileobj(r, f)
HDRI = {'kun': ['kloofendal_48d_partly_cloudy_puresky', 'kloofendal_43d_clear_puresky'], 'kech': ['evening_road_01_puresky', 'belfast_sunset_puresky']}
TEX = ['white_stucco', 'plastered_wall', 'red_brick_03', 'brick_wall_02', 'clay_roof_tiles', 'roof_tiles_14', 'grey_roof_tiles_02', 'grey_roof_tiles', 'marble_01',
       'rectangular_facade_tiles', 'plaster_stone_wall_01', 'herringbone_pavement_02', 'brick_pavement', 'concrete_pavers_02', 'concrete_pavement', 'laminate_floor_02', 'diagonal_parquet', 'aerial_grass_rock', 'forest_floor']
MODELS = ['island_tree_01', 'island_tree_02', 'island_tree_03', 'tree_small_02',
          'shrub_01', 'shrub_02', 'shrub_03', 'shrub_04', 'shrub_sorrel_01', 'grass_medium_01', 'grass_medium_02', 'flower_gazania', 'periwinkle_plant', 'flower_ursinia',
          'potted_plant_01', 'potted_plant_02', 'potted_plant_04', 'planter_pot_clay', 'street_lamp_01', 'street_lamp_02', 'outdoor_table_chair_set_01', 'painted_wooden_bench',
          'sofa_02', 'Sofa_01', 'sofa_03', 'modern_coffee_table_01', 'modern_coffee_table_02', 'modern_arm_chair_01', 'ArmChair_01', 'dining_table', 'dining_chair_02', 'side_table_01', 'painted_wooden_nightstand']
man = {'hdri': {}, 'tex': [], 'models': [], 'license': 'CC0 — Poly Haven (polyhaven.com)'}
for k, ids in HDRI.items():
    for i in ids:
        try: dl(get('https://api.polyhaven.com/files/' + i)['hdri']['2k']['hdr']['url'], os.path.join(OUT, 'hdri', k + '.hdr')); man['hdri'][k] = i; print('hdri', k, i); break
        except Exception as e: print('!hdri', i, e)
MAP = {'diff.jpg': ['Diffuse', 'diff'], 'rough.jpg': ['Rough', 'rough'], 'nor.jpg': ['nor_gl', 'Normal']}
for t in TEX:
    try:
        f = get('https://api.polyhaven.com/files/' + t); info = get('https://api.polyhaven.com/info/' + t)
        d = os.path.join(OUT, 'tex', t)
        for fn, keys in MAP.items():
            for k in keys:
                if k in f:
                    r = f[k].get('1k') or f[k].get('2k'); dl(r['jpg']['url'], os.path.join(d, fn)); break
        dim = info.get('dimensions') or [2000, 2000]
        json.dump({'tile': round(max(0.5, min(8, dim[0] / 1000)), 2), 'id': t}, open(os.path.join(d, 'info.json'), 'w')); man['tex'].append(t); print('tex', t, dim)
    except Exception as e: print('!tex', t, e)
for m in MODELS:
    try:
        f = get('https://api.polyhaven.com/files/' + m)['gltf']['1k']['gltf']; d = os.path.join(OUT, '_gltf', m)
        dl(f['url'], os.path.join(d, os.path.basename(f['url'])))
        for rel, v in f.get('include', {}).items(): dl(v['url'], os.path.join(d, rel))
        man['models'].append(m); print('model', m)
    except Exception as e: print('!model', m, e)
json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
