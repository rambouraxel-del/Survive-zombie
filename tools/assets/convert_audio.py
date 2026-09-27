"""Convertit les sons retenus en MP3 (compatibles Safari iOS / Chrome Android).

Seule opération : changement de format (et coupe de durée pour les musiques
non appliquée). Usage :
  python3 tools/assets/convert_audio.py <dossier_sources> public/assets/audio
  <dossier_sources>/sfx = clone de https://github.com/Mcamento8/open-game-sfx-index
  <dossier_sources>/fv  = clone de https://github.com/tchx84/FreedomValley
"""
import os
import subprocess
import sys



SOUNDS = {
    # clé: (fichier source, qualité)
    'step_0': 'impact-sounds/footstep_grass_000.ogg',
    'step_1': 'impact-sounds/footstep_grass_001.ogg',
    'step_2': 'impact-sounds/footstep_grass_002.ogg',
    'chop_0': 'impact-sounds/impactPlank_medium_000.ogg',
    'chop_1': 'impact-sounds/impactPlank_medium_001.ogg',
    'chop_2': 'rpg-audio/chop.ogg',
    'mine_0': 'impact-sounds/impactMining_000.ogg',
    'mine_1': 'impact-sounds/impactMining_001.ogg',
    'mine_2': 'impact-sounds/impactMining_002.ogg',
    'pick_0': 'rpg-audio/cloth1.ogg',
    'pick_1': 'rpg-audio/handleSmallLeather.ogg',
    'swing_0': 'oga-battle/battle_sound_effects/swish_2.wav',
    'swing_1': 'oga-battle/battle_sound_effects/swish_3.wav',
    'hit_0': 'oga-hits-punches/hits/hit05.mp3.flac',
    'hit_1': 'oga-hits-punches/hits/hit10.mp3.flac',
    'hit_2': 'oga-hits-punches/hits/hit17.mp3.flac',
    'bow': 'oga-battle/battle_sound_effects/Bow.wav',
    'zgroan_0': 'oga-zombies/zombies/zombie-1.wav',
    'zgroan_1': 'oga-zombies/zombies/zombie-3.wav',
    'zgroan_2': 'oga-zombies/zombies/zombie-5.wav',
    'zgroan_3': 'oga-zombies/zombies/zombie-8.wav',
    'zattack': 'oga-zombies/zombies/zombie-15.wav',
    'zdeath': 'oga-zombies/zombies/zombie-20.wav',
    'click': 'interface-sounds/click_001.ogg',
    'open': 'interface-sounds/open_001.ogg',
    'close': 'interface-sounds/close_001.ogg',
    'error': 'interface-sounds/error_001.ogg',
    'confirm': 'interface-sounds/confirmation_001.ogg',
    'craft': 'rpg-audio/metalClick.ogg',
    'build': 'impact-sounds/impactPlank_medium_003.ogg',
    'eat': 'oga-rpg-pack/RPG Sound Pack/NPC/beetle/bite-small.wav',
    'door_open': 'rpg-audio/doorOpen_1.ogg',
    'door_close': 'rpg-audio/doorClose_1.ogg',
    'chest': 'rpg-audio/creak1.ogg',
    'bell': 'impact-sounds/impactBell_heavy_000.ogg',
    'objective': 'music-jingles/jingles_PIZZI04.ogg',
    'victory': 'music-jingles/jingles_PIZZI10.ogg',
    'defeat': 'music-jingles/jingles_PIZZI08.ogg',
    'hurt': 'oga-hits-punches/hits/hit22.mp3.flac',
}
# V2 : sons de combat, de magie et de créatures (RPG Sound Pack et Fantasy Sound Library de la
# copie FreedomValley ; Kenney pour les impacts)
SOUNDS_FV = {
    'knife': 'rpg-audio/knifeSlice.ogg',
    'swing_heavy': 'oga-battle/battle_sound_effects/swish_4.wav',
    'clang': 'impact-sounds/impactMetal_heavy_000.ogg',
    'thud': 'impact-sounds/impactPunch_heavy_001.ogg',
    'reload': 'rpg-audio/metalLatch.ogg',
    'glass': 'impact-sounds/impactGlass_medium_001.ogg',
    'rock_hit': 'impact-sounds/impactMining_003.ogg',
    'step_stone_0': 'impact-sounds/footstep_concrete_000.ogg',
    'step_stone_1': 'impact-sounds/footstep_concrete_002.ogg',
    'step_wood_0': 'impact-sounds/footstep_wood_000.ogg',
    'step_wood_1': 'impact-sounds/footstep_wood_002.ogg',
}
SOUNDS_FVS = {
    'spell_0': 'Fantasy Sound Library/Wav/Spell_00.ogg',
    'spell_1': 'Fantasy Sound Library/Wav/Spell_01.ogg',
    'spell_2': 'Fantasy Sound Library/Wav/Spell_02.ogg',
    'spell_3': 'Fantasy Sound Library/Wav/Spell_03.ogg',
    'spell_4': 'Fantasy Sound Library/Wav/Spell_04.ogg',
    'magic': 'RPG Sound Pack/battle/magic1.ogg',
    'cast': 'RPG Sound Pack/battle/spell.ogg',
    'sword_draw': 'RPG Sound Pack/battle/sword-unsheathe2.ogg',
    'swing_sword': 'RPG Sound Pack/battle/swing2.ogg',
    'wolf': 'RPG Sound Pack/NPC/misc/wolfman.ogg',
    'beast_0': 'RPG Sound Pack/NPC/gutteral beast/mnstr2.ogg',
    'beast_1': 'RPG Sound Pack/NPC/gutteral beast/mnstr7.ogg',
    'giant': 'RPG Sound Pack/NPC/giant/giant2.ogg',
    'ogre': 'RPG Sound Pack/NPC/ogre/ogre3.ogg',
    'shade_0': 'RPG Sound Pack/NPC/shade/shade5.ogg',
    'shade_1': 'RPG Sound Pack/NPC/shade/shade9.ogg',
    'slime': 'RPG Sound Pack/NPC/slime/slime4.ogg',
    'bite': 'RPG Sound Pack/NPC/beetle/bite-small2.ogg',
    'goblin': 'Fantasy Sound Library/Wav/Goblin_01.ogg',
    'roar_0': 'Fantasy Sound Library/Wav/Dragon_Growl_00.ogg',
    'roar_1': 'Fantasy Sound Library/Wav/Dragon_Growl_01.ogg',
    'trap': 'Fantasy Sound Library/Wav/Trap_00.ogg',
    'bottle': 'RPG Sound Pack/inventory/bottle.ogg',
    'bubble': 'RPG Sound Pack/inventory/bubble2.ogg',
    'chain': 'RPG Sound Pack/inventory/chainmail1.ogg',
    'win': 'Fantasy Sound Library/Wav/Jingle_Win_00.ogg',
    'achieve': 'Fantasy Sound Library/Wav/Jingle_Achievement_00.ogg',
    'lose': 'Fantasy Sound Library/Wav/Jingle_Lose_00.ogg',
    'step_dirt_0': 'Fantasy Sound Library/Wav/Footsteps/Footstep_Dirt_01.ogg',
    'step_dirt_1': 'Fantasy Sound Library/Wav/Footsteps/Footstep_Dirt_04.ogg',
    'step_water_0': 'Fantasy Sound Library/Wav/Footsteps/Footstep_Water_01.ogg',
    'step_water_1': 'Fantasy Sound Library/Wav/Footsteps/Footstep_Water_04.ogg',
    'cave_amb': 'Fantasy Sound Library/Wav/Ambience_Cave_00.ogg',
}
# V2 : musiques de Flare (remaxim, Brandon Morris), copie du dépôt flareteam/flare-game
MUSIC_FLARE = {
    'music_camp': 'safe_room_theme.ogg',
    'music_battle': 'battle_theme.ogg',
    'music_boss': 'boss_theme.ogg',
    'music_ruins': 'dungeon_theme.ogg',
    'music_eerie': 'forest_theme.ogg',
}
MUSIC = {
    'fire_loop': 'Fireplace Sound loop/fire.ogg',
    'music_day': 'RPG The Secret Within the Woods/RPG - The Secret Within The Silent Woods.ogg',
    'music_night': 'RPG The Graveyard/RPG_-_The_Graveyard.ogg',
    'music_title': 'RPG Title Screen Music Pack/Alexei Galar - RPG Title Screen Music Pack - 05 So it begins.ogg',
}


def conv(src, dst, bitrate):
    import imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', src, '-ac', '1' if bitrate == '64k' else '2',
                    '-b:a', bitrate, dst], check=True)


if __name__ == '__main__':
    SRC, OUT = sys.argv[1], sys.argv[2]
    SFX = os.path.join(SRC, 'sfx/audio')
    FVS = os.path.join(SRC, 'fv/assets/sounds')
    os.makedirs(OUT, exist_ok=True)
    for k, f in SOUNDS.items():
        conv(os.path.join(SFX, f), os.path.join(OUT, k + '.mp3'), '64k')
    for k, f in MUSIC.items():
        conv(os.path.join(FVS, f), os.path.join(OUT, k + '.mp3'), '96k')
    for k, f in SOUNDS_FV.items():
        conv(os.path.join(SFX, f), os.path.join(OUT, k + '.mp3'), '64k')
    for k, f in SOUNDS_FVS.items():
        conv(os.path.join(FVS, f), os.path.join(OUT, k + '.mp3'), '64k')
    FLARE = os.path.join(SRC, 'flare/mods/fantasycore/music')
    for k, f in MUSIC_FLARE.items():
        conv(os.path.join(FLARE, f), os.path.join(OUT, k + '.mp3'), '96k')
    print('ok', len(SOUNDS) + len(MUSIC) + len(SOUNDS_FV) + len(SOUNDS_FVS) + len(MUSIC_FLARE))
