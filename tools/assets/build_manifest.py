"""Génère public/assets/manifest.json : chaque fichier local -> pack, auteurs,
URL source, copie téléchargée, licence et fichiers d'origine."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from convert_audio import MUSIC, MUSIC_FLARE, SOUNDS, SOUNDS_FV, SOUNDS_FVS  # noqa: E402
from copy_v2 import FILES as V2_FILES  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
A = os.path.join(ROOT, 'public', 'assets')

PACKS = {
    'lpc-revised': {
        'pack': 'LPC Revised (ElizaWy/LPC)',
        'authors': ['Eliza Wyatt (DeathsDarling)', 'Lanea Zimmerman (Sharm)', 'Stephen Challener (Redshrike)', 'Johannes Sjölund (Wulax)', 'bluecarrot16', 'BenCreating', 'Durrani', 'YuriNikolai', 'Hyptosis', 'Demetrius', 'Craftpix.net 2D Game Assets'],
        'source': 'https://github.com/ElizaWy/LPC',
        'downloaded_from': 'https://github.com/ElizaWy/LPC (commit f07f7f5892e67c932c68f70bb04472f2c64e46bc)',
        'license': 'OGA-BY 3.0',
        'license_url': 'https://opengameart.org/content/oga-by-30-faq',
        'credits_files': 'licenses/lpc-revised/',
    },
    'ulpc': {
        'pack': 'Universal LPC Spritesheet Character Generator',
        'authors': ['voir assets/chars/CREDITS-characters.csv (auteurs fichier par fichier)'],
        'source': 'https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator',
        'downloaded_from': 'https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator (commit 4963a69795255fb15a934c47f478a8bdcf3668f5)',
        'license': 'CC-BY-SA 3.0 (certains calques aussi OGA-BY 3.0 / GPL 3.0 ; la tête de zombie et le corps musclé ne sont proposés qu’en CC-BY-SA 3.0 / GPL 3.0)',
        'license_url': 'https://creativecommons.org/licenses/by-sa/3.0/',
        'credits_files': 'public/assets/chars/CREDITS-characters.csv',
    },
    'lpc-items': {
        'pack': '[LPC] Items and game effects',
        'authors': ['Tuomo Untinen', 'Johannes Sjölund (Wulax)', 'Jetrel', 'Gwes', 'Daniel Eddeland', 'Jaidyn Reiman', 'Nila122', 'Lanea Zimmerman (Sharm)', 'ArtisticDude', 'Stephen Challener (Redshrike)', 'pennomi', 'laetissima', 'makrohn'],
        'source': 'https://opengameart.org/content/lpc-items-and-game-effects',
        'downloaded_from': 'https://github.com/tchx84/FreedomValley (commit b50dccde01eb8137ed6833aed98ecd2584ba04a9), assets/images/LPC Items And Effects/',
        'license': 'GPL 3.0 (licence sous laquelle la copie téléchargée est redistribuée)',
        'license_url': 'https://www.gnu.org/licenses/gpl-3.0.html',
        'credits_files': 'licenses/lpc-items-and-effects-credits.txt',
    },
    'lpc-signposts': {
        'pack': '[LPC] Signposts, graves, line cloths and scare crow',
        'authors': ['Tuomo Untinen et al.'],
        'source': 'https://opengameart.org/content/lpc-signposts-graves-line-cloths-and-scare-crow',
        'downloaded_from': 'https://github.com/tchx84/FreedomValley (commit b50dccde01eb8137ed6833aed98ecd2584ba04a9)',
        'license': 'GPL 3.0 (licence sous laquelle la copie téléchargée est redistribuée)',
        'license_url': 'https://www.gnu.org/licenses/gpl-3.0.html',
    },
}

AUDIO_PACKS = {
    'impact-sounds': ('Kenney — Impact Sounds', 'Kenney', 'https://kenney.nl/assets/impact-sounds', 'CC0 1.0'),
    'rpg-audio': ('Kenney — RPG Audio', 'Kenney', 'https://kenney.nl/assets/rpg-audio', 'CC0 1.0'),
    'interface-sounds': ('Kenney — Interface Sounds', 'Kenney', 'https://kenney.nl/assets/interface-sounds', 'CC0 1.0'),
    'music-jingles': ('Kenney — Music Jingles', 'Kenney', 'https://kenney.nl/assets/music-jingles', 'CC0 1.0'),
    'oga-zombies': ('Zombies Sound Pack', 'artisticdude', 'https://opengameart.org/content/zombies-sound-pack', 'CC0 1.0'),
    'oga-rpg-pack': ('RPG Sound Pack', 'artisticdude', 'https://opengameart.org/content/rpg-sound-pack', 'CC0 1.0'),
    'oga-hits-punches': ('37 Hits/Punches', 'qubodup', 'https://opengameart.org/content/37-hitspunches', 'CC0 1.0'),
    'oga-battle': ('Battle Sound Effects', 'Ogrebane', 'https://opengameart.org/content/battle-sound-effects', 'CC0 1.0'),
}
MUSIC_PACKS = {
    'fire_loop': ('Fireplace Sound Loop', 'PagDev', 'https://opengameart.org/content/fireplace-sound-loop', 'CC0 1.0'),
    'music_day': ('RPG – The Secret Within the Silent Woods', 'hitctrl', 'https://opengameart.org/content/rpg-the-secret-within-the-woods', 'CC-BY 3.0'),
    'music_night': ('RPG – The Graveyard', 'hitctrl', 'https://opengameart.org/content/rpg-the-graveyard', 'CC-BY 3.0'),
    'music_title': ('RPG Title Screen Music Pack — 05 So it begins', 'Alexei Galar', 'https://opengameart.org/content/rpg-title-screen-music-pack', 'CC-BY 4.0'),
}

entries = []
fs = json.load(open(os.path.join(A, 'atlas', 'frame_sources.json')))
world_src = sorted(set(fs['world.png'].values()))
items_src = sorted(set(fs['items.png'].values()))
entries.append({**PACKS['lpc-revised'], 'local_files': ['assets/atlas/world.png', 'assets/atlas/world.json', 'assets/atlas/offsets.json', 'assets/tiles/terrain_summer.png', 'assets/tiles/terrain_autumn.png'],
                'original_files': world_src + ['Terrain/terrain_summer.png', 'Terrain/terrain_autumn.png'],
                'modifications': 'Découpage de cellules, rognage de la transparence, assemblage en atlas. Aucune retouche de pixels.'})
sig = [s for s in items_src if 'Signposts' in s]
itm = [s for s in items_src if 'Items And Effects' in s]
entries.append({**PACKS['lpc-items'], 'local_files': ['assets/atlas/items.png (cadres i_*, fx_*)', 'assets/atlas/items.json', 'favicon.png (fragment rouge agrandi ×2)'], 'original_files': itm,
                'modifications': 'Découpage de cellules et assemblage en atlas.'})
entries.append({**PACKS['lpc-signposts'], 'local_files': ['assets/atlas/items.png (cadres grave_cross, grave_cross_b, signpost, scarecrow)'], 'original_files': sig,
                'modifications': 'Découpage de cellules et assemblage en atlas.'})
entries.append({**PACKS['ulpc'], 'local_files': ['assets/chars/player.png', 'assets/chars/rodeur.png', 'assets/chars/affame.png', 'assets/chars/brute.png', 'assets/chars/CREDITS-characters.csv'],
                'original_files': 'voir CREDITS-characters.csv',
                'modifications': 'Superposition des calques (comme le générateur), recoloration avec les palettes officielles du générateur (vêtements, cheveux, peau « zombie_green »), placement des animations dans une seule feuille.'})
entries.append({**PACKS['ulpc'], 'local_files': ['assets/chars/equip.png', 'assets/chars/equip.json'],
                'original_files': 'voir CREDITS-characters.csv (lignes tools/…, weapon/…, torso/armour/…)',
                'license': 'CC-BY-SA 3.0 (chaque calque est aussi proposé sous d’autres licences compatibles, voir le CSV ; la lance n’existe qu’en CC-BY-SA 3.0)',
                'modifications': 'Découpage des cellules des calques d’armes, d’outils et de protections, rognage de la transparence, assemblage en atlas (build_equipment.py). La 9e image de marche à l’arc, absente du pack, réutilise la 1re. Aucune retouche de pixels.'})
for key, src in SOUNDS.items():
    pack = src.split('/')[0]
    name, author, url, lic = AUDIO_PACKS[pack]
    entries.append({'pack': name, 'authors': [author], 'source': url, 'downloaded_from': f'https://github.com/Mcamento8/open-game-sfx-index (audio/{src})', 'license': lic,
                    'local_files': [f'assets/audio/{key}.mp3'], 'original_files': [src], 'modifications': 'Conversion en MP3 mono 64 kb/s.'})
for key, src in MUSIC.items():
    name, author, url, lic = MUSIC_PACKS[key]
    entries.append({'pack': name, 'authors': [author], 'source': url, 'downloaded_from': f'https://github.com/tchx84/FreedomValley (assets/sounds/{src})', 'license': lic,
                    'local_files': [f'assets/audio/{key}.mp3'], 'original_files': [src], 'modifications': 'Conversion en MP3 96 kb/s.'})

# ---------------------------------------------------------------- V2
FV_DL = 'https://github.com/tchx84/FreedomValley (commit b50dccde01eb8137ed6833aed98ecd2584ba04a9)'
V2_PACKS = [
    ('LPC bears deer lions and more', ['Sevarihk', 'tapatilorenzo', 'et al.'], 'https://opengameart.org/content/lpc-bears-deer-lions-and-more', 'CC-BY 4.0', 'licenses/v2/lpc-bears-deer-lions-COPYING.txt', 'LPC bears deer lions and more'),
    ('LPC Base Assets', ['Lanea « Sharm » Zimmerman', 'et al.'], 'https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles', 'GPL 3.0', 'licenses/v2/lpc-base-assets-CREDITS.txt', 'LPC Base Assets'),
    ('LPC farming tilesets, magic animations and UI elements', ['Daniel Eddeland', 'et al.'], 'https://opengameart.org/content/lpc-farming-tilesets-magic-animations-and-ui-elements', 'GPL 3.0', 'licenses/v2/lpc-farming-magic-readme.txt', 'LPC Farming tilesets'),
    ('LPC house interior', ['Lanea « Sharm » Zimmerman', 'et al.'], 'https://opengameart.org/content/lpc-house-interior-and-decorations', 'GPL 3.0', 'licenses/v2/lpc-house-interior-credits.txt', 'LPC house interior'),
    ('LPC Dungeon Elements', ['Lanea « Sharm » Zimmerman', 'William Thompson', 'et al.'], 'https://opengameart.org/content/lpc-dungeon-elements', 'GPL 3.0', 'licenses/v2/lpc-dungeon-elements-credit.txt', 'LPC Dungeon Elements'),
    ('LPC Rocks', ['bluecarrot16', 'et al.'], 'https://opengameart.org/content/lpc-rocks', 'CC-BY 4.0', 'licenses/v2/lpc-rocks-CREDITS.txt', 'LPC Rocks'),
    ('LPC Trees', ['bluecarrot16', 'et al.'], 'https://opengameart.org/content/lpc-trees', 'CC-BY-SA 3.0', 'licenses/v2/lpc-trees-CREDITS.txt', 'LPC Trees'),
]
props_src = sorted(set(fs['props.png'].values()))
for name, authors, url, lic, cred, key in V2_PACKS:
    local = [f'assets/{dst}' for dst, src in V2_FILES.items() if key in src]
    orig = [src for src in V2_FILES.values() if key in src] + [x for x in props_src if key in x]
    if any(key in x for x in props_src):
        local.append('assets/atlas/props.png (cadres correspondants)')
    entries.append({'pack': name, 'authors': authors, 'source': url, 'downloaded_from': FV_DL, 'license': lic, 'credits_files': cred,
                    'local_files': local, 'original_files': orig, 'modifications': 'Copie sans modification (feuilles, tuiles) ; pour l’atlas : découpage et assemblage.'})
el_props = [x for x in props_src if not any(k in x for *_, k in V2_PACKS)]
entries.append({**PACKS['lpc-revised'], 'local_files': ['assets/tiles/cliff_summer.png', 'assets/atlas/props.png', 'assets/atlas/props.json'],
                'original_files': ['Terrain/cliff_summer.png'] + el_props, 'modifications': 'Copie (falaises) ; découpage et assemblage en atlas (objets).'})
entries.append({**PACKS['ulpc'], 'local_files': ['assets/chars/merc.png', 'assets/chars/merc_archer.png', 'assets/chars/chief.png'], 'original_files': 'voir CREDITS-characters.csv',
                'modifications': 'Superposition des calques et recoloration avec les palettes officielles du générateur.'})
for key, src in SOUNDS_FV.items():
    pack = src.split('/')[0]
    name, author, url, lic = AUDIO_PACKS[pack]
    entries.append({'pack': name, 'authors': [author], 'source': url, 'downloaded_from': f'https://github.com/Mcamento8/open-game-sfx-index (audio/{src})', 'license': lic,
                    'local_files': [f'assets/audio/{key}.mp3'], 'original_files': [src], 'modifications': 'Conversion en MP3 mono 64 kb/s.'})
for key, src in SOUNDS_FVS.items():
    if src.startswith('Fantasy'):
        name, author, url, lic = ('Fantasy Sound Library', 'Little Robot Sound Factory', 'https://opengameart.org/content/fantasy-sound-effects-library', 'CC-BY 3.0')
    else:
        name, author, url, lic = AUDIO_PACKS['oga-rpg-pack']
    entries.append({'pack': name, 'authors': [author], 'source': url, 'downloaded_from': f'{FV_DL}, assets/sounds/{src}', 'license': lic,
                    'local_files': [f'assets/audio/{key}.mp3'], 'original_files': [src], 'modifications': 'Conversion en MP3 mono 64 kb/s.'})
for key, src in MUSIC_FLARE.items():
    rem = src != 'forest_theme.ogg'
    entries.append({'pack': f'Flare — {src}', 'authors': ['remaxim' if rem else 'Brandon Morris (Augmentality)'], 'source': 'https://opengameart.org/users/remaxim' if rem else 'https://opengameart.org/content/creepy-forest-f',
                    'downloaded_from': f'https://github.com/flareteam/flare-game (commit af6eee6), mods/fantasycore/music/{src}', 'license': 'CC-BY-SA 3.0' if rem else 'CC-BY 3.0',
                    'credits_files': 'licenses/v2/flare-music-credits.md', 'local_files': [f'assets/audio/{key}.mp3'], 'original_files': [src], 'modifications': 'Conversion en MP3 96 kb/s.'})

# fichiers réellement présents non couverts ?
present = []
for root, _, files in os.walk(A):
    for f in files:
        present.append(os.path.relpath(os.path.join(root, f), os.path.join(ROOT, 'public')))
covered = set()
for e in entries:
    for lf in e['local_files']:
        covered.add(lf.split(' ')[0])
missing = [p for p in present if p not in covered and not p.endswith(('manifest.json', 'frame_sources.json'))]
out = {'project': 'Les Bois de Cendre', 'generated_by': 'tools/assets/build_manifest.py', 'entries': entries, 'uncovered_files': missing}
json.dump(out, open(os.path.join(A, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
print(len(entries), 'entrées ; non couverts :', missing)
