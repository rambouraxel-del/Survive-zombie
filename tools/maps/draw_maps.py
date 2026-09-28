"""Brouillons des cartes V2 (aide à la conception). Écrit l'ASCII dans <sortie>/<id>.txt et un
aperçu <id>.png. Les cartes du jeu sont ensuite copiées dans src/maps/*.ts.

Usage : python3 tools/maps/draw_maps.py <dossier_sortie>
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from canvas import Canvas, preview  # noqa: E402


def camp():
    c = Canvas(40, 30, '.', seed=11)
    c.border('T', t=1, jag=0.6)
    c.rect(0, 0, 40, 2, 'T')
    # route du sud jusqu'à la place du feu
    c.path([(20, 29), (20, 24), (20, 17)], ',', width=2)
    c.disc(20, 14.5, 3.2, ',')
    c.path([(19, 12), (18, 9)], ',', width=2)
    # étang à l'est
    c.disc(33, 22, 2.6, '~')
    c.scatter('f', 28, 18, 10, 9, 0.12, clear=0)
    c.scatter('f', 3, 3, 34, 24, 0.02)
    c.scatter('p', 3, 3, 34, 24, 0.012)
    c.scatter('T', 2, 2, 6, 26, 0.18)
    c.scatter('T', 34, 2, 5, 16, 0.2)
    c.rect(15, 2, 11, 7, '.')  # dégagement autour de la maison
    # maison (empreinte 7×3 en 17..23 × 5..7)
    c.set(17, 5, 'H')
    c.set(20, 14, 'F')  # feu
    c.set(24, 13, 'W')  # établi (2×1)
    c.set(14, 10, 'C')  # coffre de départ
    c.set(13, 13, 'A')  # râtelier : choix de l'arme
    c.set(26, 17, 'D')  # mannequin
    c.set(22, 26, 'S')  # départ en expédition
    c.set(9, 12, 'Y')
    c.set(31, 11, 'Y')
    c.set(20, 18, 'P')
    c.set(18, 8, 'X')  # porte de la maison
    return c


def house():
    rows = [
        '############',
        '############',
        '%B____H___C%',
        '%__________%',
        '%__________%',
        '%__________%',
        '%__________%',
        '%__________%',
        '%%%%%XX%%%%%',
    ]
    c = Canvas(12, 9, '_')
    for y, r in enumerate(rows):
        c.put(0, y, r)
    c.set(5, 6, 'P')
    return c


def bois():
    c = Canvas(64, 48, '.', seed=21)
    c.border('T', t=2, jag=0.6)
    # ruisseau et étang du nord
    c.path([(45, 0), (44, 8), (40, 14), (41, 22), (44, 30), (43, 38), (46, 47)], '~', width=2.2)
    c.disc(44, 6, 3.4, '~')
    # étang aux saules
    c.disc(11, 17, 3.4, '~')
    # routes
    c.path([(4, 43), (16, 41), (28, 38), (30, 30), (30, 21)], ',', width=2, only='.T"')
    c.path([(30, 30), (39, 30), (46, 30), (52, 32), (56, 27)], ',', width=2, only='.T"~')
    c.path([(30, 20), (34, 16), (38, 14), (43, 14), (48, 12), (53, 10)], ',', width=2, only='.T"~')
    c.path([(28, 22), (22, 21), (16, 21)], ',', width=1.6, only='.T"')
    # ponts
    for y in (29, 30, 31):
        for x in range(37, 48):
            if c.get(x, y) == '~':
                c.set(x, y, '=')
    for y in (13, 14, 15):
        for x in range(36, 46):
            if c.get(x, y) == '~':
                c.set(x, y, '=')
    # cache du braconnier (nord-ouest), accessible par un passage étroit
    c.rect(2, 2, 10, 10, 'T')
    c.rect(3, 3, 5, 4, '.')
    c.path([(10, 13), (8, 9), (6, 6)], '.', width=1.8)
    # tanière du prédateur : falaise au nord-est et clairière
    c.rect(49, 0, 15, 3, '#')
    c.rect(49, 3, 13, 11, ',')
    c.disc(55, 8, 5, ',')
    c.frame(48, 2, 15, 13, 'T')
    c.rect(48, 9, 1, 3, ',')  # entrée ouest de la clairière
    c.rect(52, 14, 3, 1, ',')  # entrée sud
    # éboulis de l'est : falaise et filons
    c.rect(59, 18, 3, 14, '#')
    c.scatter('r', 52, 18, 7, 14, 0.06, on=('.',))
    for (x, y) in [(58, 20), (57, 23), (58, 26), (57, 29)]:
        c.set(x, y, 'o')
    for (x, y) in [(58, 22), (58, 30)]:
        c.set(x, y, 'c')
    c.put(54, 24, 'RR')
    c.put(55, 28, 'RR')
    # végétation
    c.scatter('T', 3, 3, 58, 42, 0.11, on=('.',), clear=0)
    c.scatter('"', 3, 3, 58, 42, 0.04, on=('.',))
    c.scatter('*', 3, 3, 58, 42, 0.012, on=('.',))
    c.scatter('f', 3, 3, 58, 42, 0.02, on=('.',))
    c.scatter('r', 3, 3, 58, 42, 0.008, on=('.',))
    c.scatter('p', 3, 3, 58, 42, 0.01, on=('.',))
    # prairie aux cerfs (dégagée)
    c.rect(47, 35, 13, 9, '.')
    c.scatter('f', 47, 35, 13, 9, 0.08)
    c.scatter('"', 47, 35, 13, 9, 0.06)
    # abords de l'étang aux saules
    for (x, y) in [(6, 13), (15, 14), (7, 21), (15, 20), (9, 22)]:
        c.set(x, y, 'b')
    for (x, y) in [(13, 12), (5, 18), (16, 17)]:
        c.set(x, y, 'm')
    for (x, y) in [(8, 13), (14, 21), (6, 16)]:
        c.set(x, y, 'h')
    # pavillon de chasse (house_c : empreinte 5×2) et abords
    c.rect(25, 15, 9, 8, '.')
    c.rect(26, 19, 7, 3, ',')
    c.set(27, 17, 'L')
    c.set(31, 21, 'K')
    c.set(26, 20, 'N')
    c.set(33, 18, 'C')
    # arrivée
    c.rect(3, 38, 10, 7, '.')
    c.set(4, 44, 'E')
    c.set(7, 42, 'P')
    c.set(10, 40, 'J')  # point de halte de l'arrivée
    # coffres
    c.set(8, 22, 'U')  # coffre renouvelable de l'étang
    c.set(4, 4, 'V')  # cache du braconnier
    c.set(6, 5, 'Q')  # note du braconnier
    c.set(47, 21, 'Z')  # réserve des chasseurs (gardée par la meute)
    # boss et entrée de la tanière
    c.set(54, 1, 'M')
    c.set(55, 7, 'B')
    # rencontres
    for (x, y) in [(26, 25), (34, 23)]:
        c.set(x, y, '1')  # rats près du pavillon
    for (x, y) in [(45, 19), (50, 23)]:
        c.set(x, y, '2')  # meute gardant la réserve
    for (x, y) in [(22, 8), (36, 40), (14, 30)]:
        c.set(x, y, '3')  # loups isolés
    for (x, y) in [(52, 38), (56, 41)]:
        c.set(x, y, '4')  # cerfs
    for (x, y) in [(20, 33), (12, 26)]:
        c.set(x, y, '5')  # rats et cerf
    # passage de la cache (tracé en dernier : rien ne doit le refermer)
    c.rect(7, 7, 2, 7, '.')
    return c


def marais():
    c = Canvas(64, 48, '~', seed=31)
    # bordure : terre et arbres morts
    c.border('t', t=1, jag=0.7)
    land = []

    def island(cx, cy, r):
        c.disc(cx, cy, r, '.')
        land.append((cx, cy, r))

    island(32, 44, 4.2)
    island(32, 24, 6.2)
    island(52, 16, 6.2)
    island(31, 7, 4.2)
    # roselière à l'ouest : bande de terre découpée
    c.rect(3, 8, 13, 25, '.')
    for y in range(9, 32, 4):
        c.path([(4 + (y % 3), y), (13, y + 1)], '~', width=1)
    c.path([(9, 8), (9, 32)], '.', width=1.2)
    # chaussées (étroites)
    c.path([(32, 40), (30, 34), (32, 29)], ',', width=2)
    c.path([(16, 24), (26, 24)], ',', width=1)  # passage étroit gardé par une fleur
    c.path([(32, 18), (31, 11)], ',', width=2)
    # pont vers la chapelle
    c.path([(37, 21), (46, 18)], '=', width=2, only='~')
    c.path([(37, 21), (46, 18)], ',', width=2, only='.')
    # passerelle d'arrivée
    c.rect(31, 46, 2, 2, '=')
    # raccourci : tronc à pousser (du nord) entre l'îlot central et l'arrivée
    # (cases d'eau 24..25 × 31..37 converties en pont)
    c.rect(25, 29, 3, 2, '.')
    c.rect(22, 38, 5, 3, '.')
    # décor
    c.scatter('t', 2, 2, 60, 44, 0.12, on=('.',))
    c.scatter('j', 2, 2, 60, 44, 0.08, on=('.',))
    c.scatter('j', 2, 2, 60, 44, 0.03, on=('~',))
    c.scatter('k', 3, 8, 13, 25, 0.05, on=('.',))
    c.scatter('g', 3, 8, 13, 25, 0.04, on=('.',))
    c.scatter('h', 2, 2, 60, 44, 0.015, on=('.',))
    c.scatter('k', 40, 8, 20, 20, 0.02, on=('.',))
    c.scatter('s', 44, 10, 16, 14, 0.03, on=('.',))
    # îlot central : cabane de la sorcière
    c.rect(28, 19, 9, 10, '.')
    c.set(29, 19, 'L')
    c.set(35, 26, 'V')  # lanterne votive
    c.set(28, 25, 'N')
    # chapelle engloutie
    c.rect(48, 12, 9, 8, ':')
    c.set(50, 11, 'O')  # dolmen
    for (x, y) in [(47, 13), (57, 13), (47, 19), (57, 19)]:
        c.set(x, y, 'I')  # menhirs
    c.set(52, 16, 'Z')  # coffre rare
    # arbre mort géant
    c.set(30, 7, 'G')
    c.set(33, 9, 'U')  # coffre renouvelable
    # arrivée
    c.set(32, 43, 'P')
    c.set(30, 46, 'E')
    c.set(34, 42, 'J')  # lanterne votive de l'arrivée
    # raccourci
    c.rect(24, 31, 2, 7, '~')
    c.set(24, 30, 'Y')
    c.path([(25, 40), (29, 43)], ',', width=1.6, only='~.')
    # îlots décoratifs
    for (x, y, r) in [(44, 36, 1.6), (50, 30, 2.2), (14, 40, 1.8), (58, 36, 1.5), (42, 6, 1.8), (20, 12, 1.4)]:
        c.disc(x, y, r, '.', only='~')
        c.set(int(x), int(y), 't')
    # coffre caché de la roselière
    c.set(4, 29, 'Q')
    # rencontres
    for (x, y) in [(31, 36), (30, 14), (21, 24), (12, 20)]:
        c.set(x, y, '1')  # égarés enfouis
    for (x, y) in [(7, 12), (11, 27)]:
        c.set(x, y, '2')  # renards corrompus
    for (x, y) in [(50, 18), (55, 14)]:
        c.set(x, y, '3')  # âmes corrompues
    c.set(19, 24, 'F')  # fleur dévoreuse sur le passage étroit
    c.set(40, 20, 'F')
    c.set(34, 30, '4')  # rats
    # le chemin du nord contourne la maison par l'est
    c.rect(33, 16, 3, 3, ',')
    return c


def bastion():
    c = Canvas(64, 52, ',', seed=41)
    c.border('T', t=2, jag=0.5)
    # murailles extérieures
    c.rect(4, 42, 56, 3, '#')
    c.rect(4, 14, 2, 31, '#')
    c.rect(58, 14, 2, 31, '#')
    c.rect(4, 14, 56, 2, '#')
    # porte extérieure (arche)
    c.rect(31, 42, 2, 3, ',')
    c.set(30, 44, 'A')
    # muraille intérieure et herse
    c.rect(6, 22, 52, 3, '#')
    c.rect(31, 22, 2, 3, ',')
    c.set(31, 24, 'G')
    c.set(32, 24, 'G')
    # passage des écuries (herse ouverte depuis la cour : raccourci)
    c.rect(50, 22, 2, 3, ',')
    c.set(50, 24, 'H')
    c.set(51, 24, 'H')
    # donjon
    c.rect(16, 2, 32, 2, '#')
    c.rect(16, 2, 2, 9, '#')
    c.rect(46, 2, 2, 9, '#')
    c.rect(16, 9, 14, 2, '#')
    c.rect(34, 9, 14, 2, '#')
    c.rect(18, 4, 28, 5, ':')
    c.rect(30, 9, 4, 2, ':')
    # cour intérieure
    c.rect(6, 16, 52, 6, ',')
    c.rect(22, 16, 20, 6, ':')
    # caserne (ouest)
    c.frame(7, 27, 13, 11, '#', t=1)
    c.rect(8, 28, 11, 9, ':')
    c.rect(12, 37, 3, 1, ',')  # porte sud
    # écuries (est)
    c.frame(44, 27, 14, 10, '#', t=1)
    c.rect(45, 28, 12, 8, ',')
    c.rect(49, 36, 3, 1, ',')
    c.rect(50, 25, 2, 2, ',')
    c.rect(50, 27, 2, 1, ',')
    # porte arrière (ouverte à la mort du chef) et chemin de ronde extérieur
    c.rect(58, 18, 2, 2, ',')
    c.set(58, 19, 'K')
    c.set(59, 19, 'K')
    c.rect(60, 16, 2, 34, ',')
    c.path([(61, 49), (40, 49)], ',', width=2)
    # abords sud
    c.path([(31, 51), (31, 45)], ',', width=2)
    c.scatter('t', 3, 45, 58, 5, 0.1, on=(',',))
    c.scatter('T', 0, 16, 4, 36, 0.3, on=(',',))
    c.scatter('p', 6, 25, 52, 17, 0.02, on=(',',))
    c.scatter('s', 6, 25, 52, 17, 0.008, on=(',',))
    c.scatter('"', 3, 45, 58, 5, 0.06, on=(',',))
    # décors et repères
    c.set(33, 47, 'J')  # halte devant la porte
    c.set(31, 49, 'P')
    c.set(28, 50, 'E')
    c.set(29, 20, 'j')  # placeholder remplacé ci-dessous
    c.set(29, 20, 'Q')  # halte de la cour
    c.set(9, 28, 'L')  # treuil de la herse (caserne)
    c.set(48, 17, 'M')  # levier des écuries (cour)
    c.set(17, 30, 'C')  # coffre de l'armurerie
    c.set(55, 29, 'U')  # coffre des écuries
    c.set(24, 5, 'Z')  # trésor du chef (après le boss)
    c.set(52, 18, 'N')  # note de la chapelle
    c.set(32, 6, 'B')
    c.set(61, 21, '@')  # départ du donjon (devant la poterne)
    c.set(61, 23, '&')  # sortie du donjon
    # tentes et ruines de la basse-cour
    for (x, y) in [(24, 30), (37, 33), (28, 38)]:
        c.set(x, y, 'R')
    for (x, y) in [(22, 27), (40, 28), (26, 35), (42, 39)]:
        c.set(x, y, 'O')  # caisses
    # pans de murs écroulés (abris contre les tirs)
    c.rect(24, 32, 4, 1, '#')
    c.rect(34, 29, 1, 3, '#')
    c.rect(38, 37, 4, 1, '#')
    c.rect(22, 38, 1, 2, '#')
    c.rect(10, 18, 5, 1, '#')
    c.rect(44, 12, 1, 3, '#')
    c.set(33, 18, 'W')  # puits (auge)
    c.set(52, 16, 'I')  # piliers de la chapelle
    c.set(55, 16, 'I')
    c.set(52, 20, 'I')
    c.set(55, 20, 'I')
    # rencontres (partie principale)
    for (x, y) in [(20, 32), (36, 36), (30, 28)]:
        c.set(x, y, '1')  # mercenaires
    for (x, y) in [(42, 30), (14, 40)]:
        c.set(x, y, '2')  # arbalétriers
    for (x, y) in [(12, 32), (16, 34)]:
        c.set(x, y, '3')  # caserne
    for (x, y) in [(26, 18), (40, 19), (46, 20)]:
        c.set(x, y, '4')  # cour
    for (x, y) in [(53, 18)]:
        c.set(x, y, '5')  # chapelle : égarés
    for (x, y) in [(22, 5), (42, 5)]:
        c.set(x, y, '6')  # arbalétriers de la grande salle
    return c


def carriere():
    c = Canvas(64, 52, ',', seed=51)
    c.border('#', t=1, jag=0.0)
    # bandes de falaises
    c.rect(1, 13, 62, 2, '#')
    c.rect(1, 28, 62, 2, '#')
    c.rect(1, 38, 62, 2, '#')
    # rampes
    c.rect(50, 13, 3, 2, ',')  # terrasse haute -> moyenne (est)
    c.rect(8, 28, 3, 2, ',')  # terrasse moyenne -> fond (ouest)
    c.rect(31, 38, 2, 2, ',')  # entrée des galeries
    # échelle-raccourci (ouest) : relevée au départ
    c.rect(5, 13, 1, 2, '#')
    c.set(5, 13, 'Y')
    # sous-sol : parois irrégulières
    c.rect(1, 40, 62, 11, '#')
    c.rect(4, 41, 56, 9, ',')
    c.disc(32, 46, 9, ',')
    c.rect(4, 41, 10, 3, '#')
    c.rect(50, 46, 10, 4, '#')
    # décor
    D = (',',)
    # crête : arbres morts, broussailles, éboulis
    c.scatter('t', 2, 2, 60, 2, 0.35, on=D)
    for (x, y) in [(14, 6), (26, 9), (44, 5), (52, 9), (60, 7), (33, 4)]:
        c.put(x, y, 'tt')
    c.scatter('r', 2, 2, 60, 10, 0.05, on=D, clear=1)
    c.scatter('"', 2, 2, 60, 10, 0.07, on=D)
    c.scatter('p', 2, 2, 60, 36, 0.05, on=D)
    # terrasse moyenne : blocs équarris, rochers
    c.scatter('r', 2, 15, 60, 13, 0.05, on=D, clear=1)
    for (x, y) in [(8, 18), (12, 24), (46, 25), (54, 16), (18, 17)]:
        c.put(x, y, 'RR')
    c.scatter('t', 2, 26, 60, 1, 0.2, on=D)
    # fond de carrière : éboulis denses
    c.scatter('r', 2, 30, 60, 8, 0.07, on=D, clear=1)
    c.scatter('s', 2, 30, 60, 8, 0.02, on=D)
    # galeries
    c.scatter('x', 4, 41, 56, 9, 0.02, on=D)
    c.scatter('s', 4, 41, 56, 9, 0.02, on=D)
    c.scatter('w', 4, 41, 56, 9, 0.02, on=D)
    c.scatter('p', 4, 41, 56, 9, 0.04, on=D)
    for (x, y) in [(56, 18), (58, 21), (55, 24), (59, 17)]:
        c.set(x, y, 'o')
    for (x, y) in [(57, 20), (60, 24)]:
        c.set(x, y, 'c')
    for (x, y) in [(14, 33), (40, 34), (47, 31)]:
        c.set(x, y, 'o')
    for (x, y) in [(20, 35), (52, 33)]:
        c.set(x, y, 'c')
    for (x, y) in [(10, 45), (54, 43), (20, 48), (44, 49)]:
        c.set(x, y, 'x')
    for (x, y) in [(22, 32), (36, 31), (44, 35), (27, 36)]:
        c.put(x, y, 'RR')
    # stalagmites
    for (x, y) in [(15, 43), (18, 46), (47, 44), (43, 42), (24, 42), (40, 48)]:
        c.set(x, y, 'I')
    # camp des carriers (terrasse moyenne)
    c.rect(24, 17, 16, 9, ',')
    for (x, y) in [(25, 18), (38, 18)]:
        c.set(x, y, 'W')  # tables
    for (x, y) in [(27, 24), (36, 24), (33, 18)]:
        c.set(x, y, 'O')  # tonneaux et caisses
    c.set(31, 21, 'Q')  # halte du camp
    c.set(29, 19, 'N')
    c.set(22, 20, 'A')  # tour de pierres (repère)
    # arrivée
    c.set(5, 4, 'P')
    c.set(3, 3, 'E')
    c.set(8, 5, 'J')
    # entrée des galeries
    c.set(31, 39, 'M')
    c.set(33, 42, 'K')  # halte des galeries
    c.set(30, 42, '@')  # départ du donjon
    c.set(29, 41, '&')  # sortie du donjon
    # coffres
    c.set(60, 26, 'C')  # filons de l'est
    c.set(6, 35, 'U')  # fond de carrière
    c.set(8, 47, 'Z')  # trésor de la caverne (après le boss)
    c.set(58, 42, 'V')  # recoin des galeries
    c.set(32, 46, 'B')
    # rencontres
    for (x, y) in [(20, 7), (40, 9)]:
        c.set(x, y, '1')  # renards corrompus sur la crête
    for (x, y) in [(46, 20), (18, 23)]:
        c.set(x, y, '2')  # égarés enfouis
    for (x, y) in [(30, 33), (48, 34), (12, 31)]:
        c.set(x, y, '3')  # ours corrompus
    for (x, y) in [(22, 45), (44, 44), (10, 48)]:
        c.set(x, y, '4')  # âmes des galeries
    for (x, y) in [(56, 22), (38, 6)]:
        c.set(x, y, '5')  # rats
    return c


MAPS = {'camp': camp, 'house': house, 'bois': bois, 'marais': marais, 'bastion': bastion, 'carriere': carriere}

if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for k, f in MAPS.items():
        c = f()
        with open(os.path.join(out, k + '.txt'), 'w') as fh:
            fh.write('\n'.join(c.text()) + '\n')
        preview(c, os.path.join(out, k + '.png'), scale=10)
        print(k, c.w, 'x', c.h)
