"""V2 : copie sans modification des feuilles de créatures, d'animations magiques et de tuiles
utilisées telles quelles par le jeu (seule opération : copie du fichier PNG d'origine).

Usage : python3 tools/assets/copy_v2.py <dossier_sources> public/assets
  <dossier_sources>/fv    = clone de https://github.com/tchx84/FreedomValley
  <dossier_sources>/eliza = clone de https://github.com/ElizaWy/LPC
"""
import os
import shutil
import sys

FV = 'fv/assets/images/'
CRE = FV + 'LPC bears deer lions and more/individual creature spritesheets/'
MON = FV + 'LPC Base Assets/sprites/monsters/'
MAG = FV + 'LPC Farming tilesets magic animations and UI elements/magic/'
TIL = FV + 'LPC Base Assets/tiles/'

FILES = {
    # créatures (Sevarihk, bluecarrot16, Stephen Challener… ; « LPC bears deer lions and more »)
    'chars/bear_grizzly.png': CRE + 'bear, grizzly.png',
    'chars/bear_black.png': CRE + 'bear, black.png',
    'chars/fox_arctic.png': CRE + 'fox, arctic.png',
    'chars/fox_woods.png': CRE + 'fox, woods.png',
    'chars/rat.png': CRE + 'giant rat (Sevarihk).png',
    'chars/deer.png': CRE + 'deer, light buck.png',
    # monstres de base LPC (Lanea Zimmerman et al.)
    'chars/ghost.png': MON + 'ghost.png',
    'chars/worm.png': MON + 'big_worm.png',
    'chars/flower.png': MON + 'man_eater_flower.png',
    # animations magiques (Daniel Eddeland)
    'fx/firelion.png': MAG + 'magic_firelion_sheet.png',
    'fx/iceshield.png': MAG + 'magic_iceshield_sheet.png',
    'fx/snakebite.png': MAG + 'magic_snakebite_sheet.png',
    'fx/torrentacle.png': MAG + 'magic_torrentacle.png',
    'fx/turtleshell.png': MAG + 'turtleshell_front.png',
    # tuiles (murs de château, sols, falaises)
    'tiles/castlewalls.png': TIL + 'castlewalls.png',
    'tiles/castlefloors.png': TIL + 'castlefloors.png',
    'tiles/dungeon.png': TIL + 'dungeon.png',
    'tiles/cliff_summer.png': 'eliza/Terrain/cliff_summer.png',
    'tiles/interior.png': FV + 'LPC house interior/interior.png',
}

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    for dst, s in FILES.items():
        os.makedirs(os.path.dirname(os.path.join(out, dst)), exist_ok=True)
        shutil.copyfile(os.path.join(src, s), os.path.join(out, dst))
    print(len(FILES), 'fichiers copiés')
