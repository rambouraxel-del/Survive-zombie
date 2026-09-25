"""Construit les atlas du jeu à partir des packs téléchargés.

Opérations effectuées uniquement : découpage de cellules, rognage de la
transparence, empaquetage dans un atlas. Aucune retouche de pixels.

Usage : python3 tools/assets/build_atlases.py <dossier_sources> <dossier_sortie>
  <dossier_sources>/eliza  = clone de https://github.com/ElizaWy/LPC
  <dossier_sources>/fv     = clone de https://github.com/tchx84/FreedomValley
"""
import json
import os
import sys

from PIL import Image

SRC = sys.argv[1]
OUT = sys.argv[2]
E = os.path.join(SRC, 'eliza')
FVI = os.path.join(SRC, 'fv/assets/images')

# (nom, fichier, x, y, w, h, taille_cellule)  — coordonnées en cellules
WORLD = [
    # Arbres (LPC Revised, Terrain/trees_*)
    ('tree_oak_a', 'Terrain/trees_summer.png', 4, 0, 3, 4),
    ('tree_oak_b', 'Terrain/trees_summer.png', 7, 0, 3, 4),
    ('tree_pine_a', 'Terrain/trees_summer.png', 4, 12, 3, 4),
    ('tree_pine_b', 'Terrain/trees_summer.png', 7, 12, 3, 4),
    ('tree_autumn_a', 'Terrain/trees_autumn.png', 4, 0, 3, 4),
    ('tree_autumn_b', 'Terrain/trees_autumn.png', 7, 0, 3, 4),
    ('tree_dead', 'Terrain/trees_summer.png', 0, 8, 3, 5),
    ('stump', 'Terrain/trees_summer.png', 0, 13, 3, 2),
    # Rochers
    ('rock_big', 'Terrain/Rocks, Grasslands.png', 4, 0, 2, 2),
    ('rock_small', 'Terrain/Rocks, Grasslands.png', 4, 2, 1, 2),
    ('rock_pebble', 'Terrain/Rocks, Grasslands.png', 5, 2, 1, 1),
    ('rock_dark_big', 'Terrain/Rocks, Grasslands.png', 4, 8, 2, 2),
    ('rock_dark_small', 'Terrain/Rocks, Grasslands.png', 4, 10, 1, 2),
    ('ore_iron', 'Objects/Small Items/Ores & Ingots/Ore, Iron.png', 1, 0, 1, 1),
    ('ore_iron_b', 'Objects/Small Items/Ores & Ingots/Ore, Iron.png', 0, 1, 1, 1),
    ('ore_coal', 'Objects/Small Items/Ores & Ingots/Ore, Coal.png', 0, 0, 1, 1),
    # Végétation
    ('grass_tall', 'Terrain/plants_summer.png', 11, 0, 1, 2),
    ('grass_tall_b', 'Terrain/plants_summer.png', 12, 0, 1, 2),
    ('grass_short', 'Terrain/plants_summer.png', 8, 1, 1, 1),
    ('bush_round', 'Terrain/plants_summer.png', 0, 0, 1, 1),
    ('bush_leafy', 'Terrain/plants_summer.png', 2, 0, 1, 1),
    ('bush_fern', 'Terrain/plants_summer.png', 3, 2, 2, 2),
    ('bush_cypress', 'Terrain/plants_summer.png', 0, 2, 1, 2),
    ('bush_berry', 'Terrain/flowers.png', 3, 0, 1, 1),
    ('bush_berry_empty', 'Terrain/flowers.png', 9, 0, 1, 1),
    ('flower_a', 'Terrain/flowers.png', 0, 3, 1, 1),
    ('flower_b', 'Terrain/flowers.png', 5, 3, 1, 1),
    ('flower_c', 'Terrain/flowers.png', 3, 4, 1, 1),
    ('morel', 'Terrain/mushrooms.png', 4, 1, 1, 1),
    ('mushroom_red', 'Terrain/mushrooms.png', 3, 1, 1, 1),
    # Constructions et objets
    ('campfire_off', 'Objects/Small Items/Fire, Camp.png', 0, 0, 1, 1),
    ('campfire_0', 'Objects/Small Items/Fire, Camp.png', 0, 1, 1, 1),
    ('campfire_1', 'Objects/Small Items/Fire, Camp.png', 1, 1, 1, 1),
    ('campfire_2', 'Objects/Small Items/Fire, Camp.png', 2, 1, 1, 1),
    ('campfire_3', 'Objects/Small Items/Fire, Camp.png', 3, 1, 1, 1),
    ('workbench', 'Objects/Furniture/Workbench, Carpentry.png', 0, 0, 4, 2),
    ('chest_closed', 'Objects/Furniture/Chest.png', 0, 0, 1, 1),
    ('chest_open', 'Objects/Furniture/Chest.png', 0, 2, 1, 1),
    ('bed_straw', 'Objects/Small Items/Hay & Straw.png', 2, 0, 2, 3),
    ('fence_h', 'Structure/Fences/Plain Fence A.png', 1, 0, 1, 1),
    ('fence_v', 'Structure/Fences/Plain Fence A.png', 0, 1, 1, 1),
    ('fence_es', 'Structure/Fences/Plain Fence A.png', 0, 0, 1, 1),
    ('fence_ws', 'Structure/Fences/Plain Fence A.png', 2, 0, 1, 1),
    ('fence_ne', 'Structure/Fences/Plain Fence A.png', 0, 3, 1, 1),
    ('fence_nw', 'Structure/Fences/Plain Fence A.png', 2, 3, 1, 1),
    ('fence_post', 'Structure/Fences/Plain Fence A.png', 3, 0, 1, 1),
    ('door_closed', 'Structure/Doors/32x48px Doors/12 Panel Door A.png', 3, 0, 1, 1, (32, 48)),
    ('door_open', 'Structure/Doors/32x48px Doors/12 Panel Door A.png', 1, 0, 1, 1, (32, 48)),
    ('spikes', 'Objects/Furniture/Sawhorse.png', 0, 0, 1, 1),
    ('forge', 'Objects/Furniture/Smithing/Furnace A.png', 0, 0, 2, 2),
    ('anvil', 'Objects/Furniture/Smithing/Anvils.png', 0, 0, 1, 1),
    ('trap', 'Objects/Small Items/Baskets A.png', 0, 0, 1, 1),
    ('trap_full', 'Objects/Small Items/Baskets A.png', 0, 1, 1, 1),
    ('lamp_on', 'Objects/Furniture/Lighting, Outdoors.png', 0, 0, 1, 3),
    ('lamp_off', 'Objects/Furniture/Lighting, Outdoors.png', 1, 0, 1, 3),
    ('crate', 'Objects/Furniture/Crate.png', 0, 1, 1, 1),
    ('crate_b', 'Objects/Furniture/Crate.png', 1, 1, 1, 1),
    ('crate_stack', 'Objects/Furniture/Crate.png', 0, 0, 1, 1),
    ('barrel', 'Objects/Furniture/Barrel.png', 0, 0, 1, 2),
    ('barrels', 'Objects/Furniture/Barrel.png', 3, 0, 2, 2),
    ('house_a', 'Structure/Structures/Brick House A.png', 0, 0, 8, 7),
    ('house_b', 'Structure/Structures/Brick House B.png', 0, 0, 6, 6),
    ('house_c', 'Structure/Structures/Paneled House A.png', 0, 0, 5, 5),
    ('pillar', 'Structure/Pillars/Stone Pillar A.png', 3, 0, 1, 3),
    ('pillar_dark', 'Structure/Pillars/Stone Pillar A.png', 6, 0, 1, 3),
    ('seal_stone', 'Objects/Furniture/Wolf Stone.png', 2, 2, 2, 2),
    ('seal_stone_on', 'Objects/Furniture/Wolf Stone.png', 0, 0, 2, 2),
    ('tomb_slab', 'Objects/Furniture/Stone Slab.png', 0, 0, 2, 1),
    ('tomb_slab_b', 'Objects/Furniture/Stone Slab.png', 2, 2, 2, 1),
    ('skull', 'Objects/Small Items/Skeletons A.png', 0, 0, 1, 1),
    ('bones', 'Objects/Small Items/Skeletons A.png', 1, 1, 1, 1),
    ('paper', 'Objects/Small Items/Loose Paper.png', 2, 2, 1, 1),
    ('hay_pile', 'Objects/Small Items/Hay & Straw.png', 0, 0, 2, 3),
    ('coal_pile', 'Objects/Furniture/Smithing/Coal Piles.png', 8, 0, 2, 2),
    # Icônes (ressources, nourriture) — LPC Revised
    ('i_wood', 'Objects/Small Items/Lumber.png', 3, 1, 1, 1),
    ('i_planks', 'Objects/Small Items/Lumber.png', 2, 0, 1, 1),
    ('i_stone', 'Objects/Small Items/Ores & Ingots/Ore, Stone.png', 0, 2, 1, 1),
    ('i_iron_ore', 'Objects/Small Items/Ores & Ingots/Ore, Iron.png', 1, 2, 1, 1),
    ('i_coal', 'Objects/Small Items/Ores & Ingots/Ore, Coal.png', 1, 3, 1, 1),
    ('i_iron', 'Objects/Small Items/Ores & Ingots/Alloys.png', 2, 0, 1, 1),
    ('i_cloth', 'Objects/Small Items/Fabric/Fabric Rolls, Groups.png', 0, 0, 1, 2),
    ('i_fiber', 'Objects/Small Items/Food/Grains, Grasses.png', 1, 1, 1, 1),
    ('i_scrap', 'Objects/Small Items/Tools, Smithing.png', 11, 1, 1, 1),
    ('i_berries', 'Objects/Small Items/Food/Fruit A.png', 1, 2, 1, 1),
    ('i_morel', 'Objects/Small Items/Food/Mushrooms.png', 8, 1, 1, 1),
    ('i_meat_raw', 'Objects/Small Items/Food/Meats B.png', 3, 0, 1, 1),
    ('i_meat_cooked', 'Objects/Small Items/Food/Meats A.png', 3, 1, 1, 1),
    ('i_skewer', 'Objects/Small Items/Food/Meats A.png', 4, 3, 1, 1),
    ('i_stew', 'Objects/Small Items/Food/Meals.png', 3, 0, 1, 1),
    ('i_jerky', 'Objects/Small Items/Food/Meats A.png', 0, 1, 1, 1),
    ('i_bandage', 'Objects/Small Items/Fabric/Blankets, Crumpled.png', 14, 0, 2, 1),
    ('i_hammer', 'Objects/Small Items/Tools, Smithing.png', 8, 1, 1, 1),
]

ITEMS = [  # LPC Items and game effects (Tuomo Untinen et al.) + graves
    ('i_sword', 'LPC Items And Effects/items1.png', 0, 0, 1, 1),
    ('i_axe_iron', 'LPC Items And Effects/items1.png', 1, 0, 1, 1),
    ('i_axe_stone', 'LPC Items And Effects/items1.png', 1, 4, 1, 1),
    ('i_pick_iron', 'LPC Items And Effects/items1.png', 3, 0, 1, 1),
    ('i_armor_light', 'LPC Items And Effects/items1.png', 4, 0, 1, 1),
    ('i_armor_iron', 'LPC Items And Effects/items1.png', 6, 1, 1, 1),
    ('i_bow', 'LPC Items And Effects/items1.png', 4, 1, 1, 1),
    ('i_spear', 'LPC Items And Effects/items1.png', 4, 3, 1, 1),
    ('i_club', 'LPC Items And Effects/items1.png', 4, 4, 1, 1),
    ('i_arrow', 'LPC Items And Effects/items1.png', 11, 4, 1, 1),
    ('i_rope', 'LPC Items And Effects/items1.png', 10, 6, 1, 1),
    ('i_torch', 'LPC Items And Effects/items1.png', 8, 1, 1, 1),
    ('i_note', 'LPC Items And Effects/items1.png', 8, 3, 1, 1),
    ('i_bread', 'LPC Items And Effects/items1.png', 7, 6, 1, 1),
    ('i_bag', 'LPC Items And Effects/items1.png', 4, 2, 1, 1),
    ('i_map', 'LPC Items And Effects/items1.png', 15, 7, 1, 1),
    ('i_chest', 'LPC Items And Effects/items1.png', 10, 7, 1, 1),
    ('i_boots', 'LPC Items And Effects/items1.png', 13, 3, 1, 1),
    ('i_frag_1', 'LPC Items And Effects/items1.png', 12, 3, 1, 1),
    ('i_frag_2', 'LPC Items And Effects/items1.png', 12, 4, 1, 1),
    ('i_frag_3', 'LPC Items And Effects/items1.png', 12, 5, 1, 1),
    ('i_hammer_big', 'LPC Items And Effects/items1.png', 11, 2, 1, 1),
    ('fx_alert', 'LPC Items And Effects/effects.png', 16, 5, 1, 1),
    ('fx_sleep', 'LPC Items And Effects/effects.png', 15, 5, 1, 1),
    ('fx_swing_0', 'LPC Items And Effects/effects.png', 5, 4, 1, 1),
    ('fx_swing_1', 'LPC Items And Effects/effects.png', 6, 4, 1, 1),
    ('fx_swing_2', 'LPC Items And Effects/effects.png', 7, 4, 1, 1),
    ('grave_cross', 'LPC Signposts graves line cloths and scare crow/signpost-outsidestuff.png', 2, 0, 1, 1),
    ('grave_cross_b', 'LPC Signposts graves line cloths and scare crow/signpost-outsidestuff.png', 2, 1, 1, 1),
    ('signpost', 'LPC Signposts graves line cloths and scare crow/signpost-outsidestuff.png', 0, 0, 1, 1),
    ('scarecrow', 'LPC Signposts graves line cloths and scare crow/signpost-outsidestuff.png', 3, 0, 1, 2),
]


def crop(base, spec):
    name, f, x, y, w, h = spec[:6]
    cw, ch = spec[6] if len(spec) > 6 else (32, 32)
    im = Image.open(os.path.join(base, f)).convert('RGBA')
    c = im.crop((x * cw, y * ch, (x + w) * cw, (y + h) * ch))
    bb = c.getbbox()
    if bb is None:
        raise SystemExit(f'Cellule vide : {name}')
    return name, c.crop(bb), f


def pack(frames, out_png, out_json, image_name):
    # Empaquetage simple par étagères, largeur fixe.
    frames = sorted(frames, key=lambda t: -t[1].height)
    width = 1024
    x = y = shelf = 0
    pos = {}
    for name, im, _ in frames:
        if x + im.width > width:
            x = 0
            y += shelf + 2
            shelf = 0
        pos[name] = (x, y)
        x += im.width + 2
        shelf = max(shelf, im.height)
    height = y + shelf
    atlas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    meta = {'frames': {}, 'meta': {'image': image_name, 'size': {'w': width, 'h': height}, 'scale': '1'}}
    for name, im, src in frames:
        px, py = pos[name]
        atlas.alpha_composite(im, (px, py))
        meta['frames'][name] = {
            'frame': {'x': px, 'y': py, 'w': im.width, 'h': im.height},
            'rotated': False, 'trimmed': False,
            'spriteSourceSize': {'x': 0, 'y': 0, 'w': im.width, 'h': im.height},
            'sourceSize': {'w': im.width, 'h': im.height},
        }
    atlas.save(out_png, optimize=True)
    with open(out_json, 'w') as fh:
        json.dump(meta, fh, indent=1)
    return {name: src for name, _, src in frames}


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    w = pack([crop(E, s) for s in WORLD], os.path.join(OUT, 'world.png'), os.path.join(OUT, 'world.json'), 'world.png')
    i = pack([crop(FVI, s) for s in ITEMS], os.path.join(OUT, 'items.png'), os.path.join(OUT, 'items.json'), 'items.png')
    with open(os.path.join(OUT, 'frame_sources.json'), 'w') as fh:
        json.dump({'world.png': w, 'items.png': i}, fh, indent=1, ensure_ascii=False)
    print(len(w), len(i))
