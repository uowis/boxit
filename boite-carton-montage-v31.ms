/*───────────────────────────────────────────────────────────────────────────
  BOITE CARTON 6 BOUTEILLES — montage automatique depuis le patron
  Cotes relevées au vecteur dans uploads/patron_faces.pdf
  Planche 1171 x 493 mm, origine en bas à gauche, 1 unité = 1 mm

  Convention retenue :
    - le tracé cote la PEAU EXTERIEURE (elle ne s'étire pas)
    - épaisseur poussée vers l'INTERIEUR  (Shell inner 3 / outer 0)
    - axe de rotation sur l'ARETE EXTERIEURE = la ligne de pli elle-même
    - mapping planaire figé sur la planche entière AVANT tout pliage

  Utilisation : MAXScript > New Script > coller > Ctrl+E
───────────────────────────────────────────────────────────────────────────*/

(
    clearListener()

    ---------------------------------------------------------------- réglages
    global BC_EPAISSEUR   = 3.0      -- épaisseur carton (mm)
    global BC_CONGE       = 0.6      -- rayon du congé de pli (0 = aucun)
                                     -- chaque crêuse reçoit deux congés, un
                                     -- par pièce : rayon apparent ≈ 1.2 mm.
    global BC_CONGE_SEG   = 1        -- 1 = simple biseau, la topologie reste
                                     -- propre. 2 ou 3 arrondissent davantage
                                     -- mais chargent le maillage.
    global BC_TEXTURE     = ""       -- ex. "C:\\patron\\patron-texture.png"
    global BC_ANIMER      = true     -- pose des clés 0 -> 100
    global BC_SENS        = -1.0     -- sens de pliage. À -1 la boîte se monte
                                     -- du côté non imprimé : l'impression
                                     -- reste dehors et le fond en bas une fois
                                     -- la racine retournée (section 7).
    global BC_EPAISSIR    = true     -- Shell + congé en fin de montage
    global BC_PATTE       = 3.2      -- retrait de la patte de collage : elle
                                     -- se colle DERRIÈRE la paroi arrière,
                                     -- donc une épaisseur + un jeu. Signe à
                                     -- inverser si elle ressort du mauvais côté.

    local SW = 1171.0, SH = 493.0    -- dimensions de la planche

    ------------------------------------------------------- outils géométrie
    -- Constructeur de contour à partir des noeuds Bézier relevés dans le
    -- PDF : chaque entrée = #(point, poignée entrante, poignée sortante).
    -- Aucun arrondi n'est recalculé, les courbes sont celles du tracé.
    fn bcSpline nom noeuds =
    (
        local s = splineShape name:nom pos:[0,0,0]
        local sp = addNewSpline s
        for k in noeuds do
            addKnot s sp #bezierCorner #curve \
                    [k[1][1], k[1][2], 0] \
                    [k[2][1], k[2][2], 0] \
                    [k[3][1], k[3][2], 0]
        close s sp
        s.steps = 12
        s.adaptive = true
        updateShape s
        s
    )

    -------------------------------------------------- 1. faces à plat
    format "-- construction des faces\n"

    local C_pAvant = #(
        #([604.044,164.474],[604.044,164.474],[604.044,164.474]),
        #([281.043,164.474],[281.043,164.474],[281.043,164.474]),
        #([281.043,328.475],[281.043,328.475],[281.043,328.475]),
        #([604.044,328.475],[604.044,328.475],[604.044,328.475])
    )
    local C_patte = #(
        #([35.044,328.475],[35.044,328.475],[35.044,328.475]),
        #([0.044,322.303],[0.044,322.303],[0.044,322.303]),
        #([0.044,170.646],[0.044,170.646],[0.044,170.646]),
        #([35.044,164.474],[35.044,164.474],[35.044,164.474])
    )
    local C_couvG = #(
        #([277.044,332.475],[277.044,332.305],[277.044,332.475]),
        #([277.044,482.975],[277.044,482.975],[277.026,488.516]),
        #([267.044,492.975],[272.585,492.957],[267.044,492.975]),
        #([49.044,492.975],[49.044,492.975],[43.502,492.957]),
        #([39.044,482.975],[39.061,488.516],[39.044,482.975]),
        #([39.044,332.475],[39.044,332.475],[39.043,332.305]),
        #([39.008,331.975],[39.029,332.139],[39.008,331.975]),
        #([277.079,331.975],[277.079,331.975],[277.058,332.139])
    )
    local C_couvD = #(
        #([846.044,332.475],[846.044,332.305],[846.044,332.475]),
        #([846.044,482.975],[846.044,482.975],[846.026,488.516]),
        #([836.044,492.975],[841.585,492.957],[836.044,492.975]),
        #([618.044,492.975],[618.044,492.975],[612.502,492.957]),
        #([608.044,482.975],[608.061,488.516],[608.044,482.975]),
        #([608.044,332.475],[608.044,332.475],[608.043,332.305]),
        #([608.008,331.975],[608.029,332.139],[608.008,331.975]),
        #([846.079,331.975],[846.079,331.975],[846.059,332.139])
    )
    local C_fondG = #(
        #([39.008,160.975],[39.008,160.975],[39.029,160.811]),
        #([39.044,160.475],[39.043,160.644],[39.044,160.475]),
        #([39.044,9.974],[39.044,9.974],[39.061,4.433]),
        #([49.044,-0.025],[43.502,-0.008],[49.044,-0.025]),
        #([267.044,-0.025],[267.044,-0.025],[272.585,-0.008]),
        #([277.044,9.974],[277.026,4.433],[277.044,9.974]),
        #([277.044,160.475],[277.044,160.475],[277.044,160.644]),
        #([277.079,160.975],[277.059,160.811],[277.079,160.975])
    )
    local C_fondD = #(
        #([608.008,160.975],[608.008,160.975],[608.029,160.811]),
        #([608.044,160.475],[608.043,160.644],[608.044,160.475]),
        #([608.044,9.974],[608.044,9.974],[608.061,4.433]),
        #([618.044,-0.025],[612.502,-0.008],[618.044,-0.025]),
        #([836.044,-0.025],[836.044,-0.025],[841.585,-0.008]),
        #([846.044,9.974],[846.026,4.433],[846.044,9.974]),
        #([846.044,160.475],[846.044,160.475],[846.045,160.644]),
        #([846.079,160.975],[846.059,160.811],[846.079,160.975])
    )
    local C_pDroite = #(
        #([846.079,331.975],[846.329,329.997],[846.079,331.975]),
        #([608.008,331.975],[608.008,331.975],[607.759,329.997]),
        #([604.044,328.474],[606.09,328.481],[604.044,328.474]),
        #([604.044,164.475],[604.044,164.475],[606.09,164.468]),
        #([608.008,160.974],[607.759,162.952],[608.008,160.974]),
        #([846.079,160.974],[846.079,160.974],[846.329,162.952]),
        #([850.044,164.475],[847.997,164.468],[850.044,164.475]),
        #([850.044,328.474],[850.044,328.474],[847.997,328.481])
    )
    local C_pGauche = #(
        #([277.072,332.02],[277.302,330.02],[277.072,332.02]),
        #([39.015,332.02],[39.015,332.02],[38.785,330.02]),
        #([35.043,328.475],[37.106,328.481],[35.043,328.475]),
        #([35.043,164.475],[35.043,164.475],[37.09,164.468]),
        #([39.008,160.975],[38.758,162.952],[39.008,160.975]),
        #([277.079,160.975],[277.079,160.975],[277.329,162.952]),
        #([281.044,164.475],[278.997,164.468],[281.044,164.475]),
        #([281.044,328.475],[281.044,328.475],[278.981,328.481])
    )
    local C_pArriere = #(
        #([850.044,164.474],[850.044,164.474],[850.044,164.474]),
        #([1171.044,164.474],[1171.044,164.474],[1171.044,164.474]),
        #([1171.044,328.475],[1171.044,328.475],[1171.044,328.475]),
        #([850.044,328.475],[850.044,328.475],[850.044,328.475])
    )
    local C_rAvH = #(
        #([528.044,411.475],[528.044,411.475],[528.044,411.475]),
        #([528.044,431.475],[528.044,431.475],[528.009,442.557]),
        #([508.044,451.475],[519.126,451.439],[508.044,451.475]),
        #([378.044,451.475],[378.044,451.475],[366.961,451.439]),
        #([358.044,431.475],[358.079,442.557],[358.044,431.475]),
        #([358.044,411.475],[358.044,411.475],[358.044,411.475]),
        #([285.044,411.475],[285.044,411.475],[285.044,411.475]),
        #([285.044,332.475],[285.044,332.475],[285.037,330.258]),
        #([281.044,328.474],[283.26,328.481],[281.044,328.474]),
        #([604.044,328.474],[604.044,328.474],[601.827,328.481]),
        #([600.044,332.475],[600.051,330.258],[600.044,332.475]),
        #([600.044,411.475],[600.044,411.475],[600.044,411.475])
    )
    local C_clA = #(
        #([358.044,431.475],[358.044,431.475],[358.079,442.557]),
        #([378.044,451.475],[366.961,451.439],[378.044,451.475]),
        #([508.044,451.475],[508.044,451.475],[519.126,451.439]),
        #([528.044,431.475],[528.009,442.557],[528.044,431.475]),
        #([528.044,411.474],[528.044,411.474],[528.044,411.474]),
        #([600.044,411.474],[600.044,411.474],[600.044,411.474]),
        #([600.044,482.974],[600.044,482.974],[600.026,488.516]),
        #([590.043,492.975],[595.585,492.957],[590.043,492.975]),
        #([295.044,492.975],[295.044,492.975],[289.502,492.957]),
        #([285.044,482.974],[285.061,488.516],[285.044,482.974]),
        #([285.044,411.474],[285.044,411.474],[285.044,411.474]),
        #([358.044,411.474],[358.044,411.474],[358.044,411.474])
    )
    local C_rAvB = #(
        #([358.044,61.475],[358.044,61.475],[358.079,50.392]),
        #([378.044,41.475],[366.961,41.51],[378.044,41.475]),
        #([508.044,41.475],[508.044,41.475],[519.126,41.51]),
        #([528.044,61.475],[528.009,50.392],[528.044,61.475]),
        #([528.044,81.475],[528.044,81.475],[528.044,81.475]),
        #([600.044,81.475],[600.044,81.475],[600.044,81.475]),
        #([600.044,160.475],[600.044,160.475],[600.051,162.691]),
        #([604.044,164.475],[601.827,164.468],[604.044,164.475]),
        #([281.044,164.475],[281.044,164.475],[283.26,164.468]),
        #([285.044,160.475],[285.037,162.691],[285.044,160.475]),
        #([285.044,81.475],[285.044,81.475],[285.044,81.475]),
        #([358.044,81.475],[358.044,81.475],[358.044,81.475])
    )
    local C_clC = #(
        #([295.044,-0.025],[289.502,-0.008],[295.044,-0.025]),
        #([590.043,-0.025],[590.043,-0.025],[595.585,-0.008]),
        #([600.044,9.974],[600.026,4.433],[600.044,9.974]),
        #([600.044,81.474],[600.044,81.474],[600.044,81.474]),
        #([528.044,81.474],[528.044,81.474],[528.044,81.474]),
        #([528.044,61.475],[528.044,61.475],[528.009,50.392]),
        #([508.044,41.475],[519.126,41.51],[508.044,41.475]),
        #([378.044,41.475],[378.044,41.475],[366.961,41.51]),
        #([358.044,61.475],[358.079,50.392],[358.044,61.475]),
        #([358.044,81.474],[358.044,81.474],[358.044,81.474]),
        #([285.044,81.474],[285.044,81.474],[285.044,81.474]),
        #([285.044,9.974],[285.044,9.974],[285.061,4.433])
    )
    local C_rArB = #(
        #([927.044,61.475],[927.044,61.475],[927.079,50.392]),
        #([947.044,41.475],[935.961,41.51],[947.044,41.475]),
        #([1076.044,41.475],[1076.044,41.475],[1087.126,41.51]),
        #([1096.044,61.475],[1096.008,50.392],[1096.044,61.475]),
        #([1096.044,81.475],[1096.044,81.475],[1096.044,81.475]),
        #([1168.044,81.475],[1168.044,81.475],[1168.044,81.475]),
        #([1168.044,159.279],[1168.044,159.279],[1168.044,159.279]),
        #([1171.044,164.475],[1171.044,164.475],[1171.044,164.475]),
        #([850.044,164.475],[850.044,164.475],[852.26,164.468]),
        #([854.043,160.475],[854.037,162.691],[854.043,160.475]),
        #([854.043,81.475],[854.043,81.475],[854.043,81.475]),
        #([927.044,81.475],[927.044,81.475],[927.044,81.475])
    )
    local C_clD = #(
        #([864.044,-0.025],[858.502,-0.008],[864.044,-0.025]),
        #([1158.044,-0.025],[1158.044,-0.025],[1163.585,-0.008]),
        #([1168.044,9.974],[1168.026,4.433],[1168.044,9.974]),
        #([1168.044,81.474],[1168.044,81.474],[1168.044,81.474]),
        #([1096.044,81.474],[1096.044,81.474],[1096.044,81.474]),
        #([1096.044,61.475],[1096.044,61.475],[1096.008,50.392]),
        #([1076.044,41.475],[1087.126,41.51],[1076.044,41.475]),
        #([947.044,41.475],[947.044,41.475],[935.961,41.51]),
        #([927.044,61.475],[927.079,50.392],[927.044,61.475]),
        #([927.044,81.474],[927.044,81.474],[927.044,81.474]),
        #([854.044,81.474],[854.044,81.474],[854.044,81.474]),
        #([854.044,9.974],[854.044,9.974],[854.061,4.433])
    )
    local C_rArH = #(
        #([1096.044,411.475],[1096.044,411.475],[1096.044,411.475]),
        #([1096.044,431.475],[1096.044,431.475],[1096.008,442.557]),
        #([1076.043,451.475],[1087.126,451.439],[1076.043,451.475]),
        #([947.044,451.475],[947.044,451.475],[935.961,451.439]),
        #([927.044,431.475],[927.079,442.557],[927.044,431.475]),
        #([927.044,411.475],[927.044,411.475],[927.044,411.475]),
        #([854.044,411.475],[854.044,411.475],[854.044,411.475]),
        #([854.044,332.475],[854.044,332.475],[854.036,330.258]),
        #([850.044,328.474],[852.26,328.481],[850.044,328.474]),
        #([1171.044,328.474],[1171.044,328.474],[1171.044,328.474]),
        #([1168.044,333.671],[1168.044,333.671],[1168.044,333.671]),
        #([1168.044,411.475],[1168.044,411.475],[1168.044,411.475])
    )
    local C_clB = #(
        #([927.044,431.475],[927.044,431.475],[927.079,442.557]),
        #([947.044,451.475],[935.961,451.439],[947.044,451.475]),
        #([1076.044,451.475],[1076.044,451.475],[1087.126,451.439]),
        #([1096.044,431.475],[1096.008,442.557],[1096.044,431.475]),
        #([1096.044,411.474],[1096.044,411.474],[1096.044,411.474]),
        #([1168.044,411.474],[1168.044,411.474],[1168.044,411.474]),
        #([1168.044,482.974],[1168.044,482.974],[1168.026,488.516]),
        #([1158.044,492.975],[1163.585,492.957],[1158.044,492.975]),
        #([864.044,492.975],[864.044,492.975],[858.503,492.957]),
        #([854.043,482.974],[854.061,488.516],[854.043,482.974]),
        #([854.043,411.474],[854.043,411.474],[854.043,411.474]),
        #([927.044,411.474],[927.044,411.474],[927.044,411.474])
    )

    local patte = bcSpline "patte_collage" C_patte
    local pGauche = bcSpline "paroi_gauche" C_pGauche
    local pAvant = bcSpline "paroi_avant" C_pAvant
    local pDroite = bcSpline "paroi_droite" C_pDroite
    local pArriere = bcSpline "paroi_arriere" C_pArriere
    local couvG = bcSpline "couvercle_gauche" C_couvG
    local couvD = bcSpline "couvercle_droit" C_couvD
    local fondG = bcSpline "fond_gauche" C_fondG
    local fondD = bcSpline "fond_droit" C_fondD
    local rAvH = bcSpline "rabat_int_avant_haut" C_rAvH
    local rAvB = bcSpline "rabat_int_avant_bas" C_rAvB
    local rArH = bcSpline "rabat_int_arriere_haut" C_rArH
    local rArB = bcSpline "rabat_int_arriere_bas" C_rArB
    local clA = bcSpline "cloison_A" C_clA
    local clB = bcSpline "cloison_B" C_clB
    local clC = bcSpline "cloison_C" C_clC
    local clD = bcSpline "cloison_D" C_clD

    local toutes = #(patte, pGauche, pAvant, pDroite, pArriere,
                     couvG, couvD, fondG, fondD,
                     rAvH, rAvB, rArH, rArB, clA, clC, clB, clD)

    ------------------------------- 2. surfacer + mapping planaire commun
    format "-- mapping planaire sur la planche entière\n"

    -- UV = position réelle de la pièce sur la planche, écrites vertex par
    -- vertex. Toutes les pièces partagent donc le même repère : la texture
    -- reste continue d'une face à l'autre, et elle est gravée dans le mesh.
    for o in toutes do
    (
        -- conversion directe : Max capsule la spline fermée en une nappe
        -- plane. Surtout pas d'Extrude amount:0, qui laisse une ceinture
        -- de faces dégénérées que le Shell fait ensuite exploser.
        convertTo o Editable_Poly
        if (polyop.getNumFaces o) == 0 do
            format "   /!\\ % non capsulée (contour ouvert ?)\n" o.name

        -- Une nappe plane saine n'a qu'UN contour de bords libres. S'il y en
        -- a plus, la capsulation a laissé un trou : c'est lui qui rend en
        -- noir. On le rebouche.
        local libres = #{}
        for e = 1 to (polyop.getNumEdges o) do
            if (polyop.getEdgeFaces o e).count == 1 do append libres e
        local nb = polyop.getNumVerts o
        if libres.numberSet > 0 do
        (
            local boucles = 0
            try
            (
                local reste = copy libres
                while reste.numberSet > 0 do
                (
                    local depart = (reste as array)[1]
                    local boucle = polyop.getEdgeLoop o #{depart}
                    reste -= (boucle * libres)
                    reste -= #{depart}
                    boucles += 1
                )
            ) catch (boucles = -1)
            if boucles > 1 do
            (
                format "   /!\\ % : % contours libres -> trou rebouché\n" o.name boucles
                try (o.EditablePoly.buttonOp #CapHoles) catch ()
            )
        )

        -- La capsulation sort certaines faces normales vers -Z, parfois une
        -- seule dans un coin arrondi : elle rend alors en noir. On teste
        -- donc face par face, pas seulement la première.
        -- (+Z = peau extérieure imprimée)
        local aRetourner = #{}
        for f = 1 to (polyop.getNumFaces o) do
            if (polyop.getFaceNormal o f).z < 0 do append aRetourner f
        if aRetourner.numberSet > 0 do
        (
            polyop.flipNormals o aRetourner
            format "   % : % face(s) retournée(s)\n" o.name aRetourner.numberSet
        )

        polyop.setMapSupport o 1 true
        local nv = polyop.getNumVerts o
        polyop.setNumMapVerts o 1 nv
        for i = 1 to nv do
        (
            local p = polyop.getVert o i
            polyop.setMapVert o 1 i [p.x / SW, p.y / SH, 0]
        )
        for f = 1 to (polyop.getNumFaces o) do
            polyop.setMapFace o 1 f (polyop.getFaceVerts o f)

        update o
        o.wirecolor = color 200 170 120
    )

    -- matériau
    local mtl = standardMaterial name:"carton_patron"
    if BC_TEXTURE != "" and doesFileExist BC_TEXTURE then
        mtl.diffuseMap = bitmapTexture filename:BC_TEXTURE
    else
        mtl.diffuse = color 198 169 126
    mtl.specularLevel = 6
    mtl.glossiness = 8
    for o in toutes do o.material = mtl
    try (showTextureMap mtl true) catch ()

    -------------------------------------------- 3. pivots sur les plis
    format "-- pivots sur les lignes de pli\n"

    -- fond_gauche est la racine : il ne tourne pas.
    -- paroi_gauche bascule sur la crêuse fond/paroi, paroi_avant sur la
    -- crêuse paroi_gauche/paroi_avant.
    fondG.pivot    = [158.0, 161.0, 0]
    pGauche.pivot  = [158.0, 161.0, 0]
    pAvant.pivot   = [281.0, 246.5, 0]
    pDroite.pivot  = [604.0, 246.5, 0]
    pArriere.pivot = [850.0, 246.5, 0]
    patte.pivot    = [35.0,  246.5, 0]

    couvG.pivot = [158.0, 332.0, 0]
    couvD.pivot = [727.0, 332.0, 0]
    fondD.pivot = [727.0, 161.0, 0]

    rAvH.pivot = [442.5,  328.5, 0]
    rAvB.pivot = [442.5,  164.5, 0]
    clA.pivot  = [442.5,  411.5, 0]
    clC.pivot  = [442.5,   81.5, 0]

    rArH.pivot = [1010.5, 328.5, 0]
    rArB.pivot = [1010.5, 164.5, 0]
    clB.pivot  = [1010.5, 411.5, 0]
    clD.pivot  = [1010.5,  81.5, 0]

    ------------------------------------------------- 4. hiérarchie
    format "-- hiérarchie (racine : fond_gauche)\n"

    -- fond_gauche est la racine : il ne tourne jamais et reste au sol.
    pGauche.parent  = fondG
    pAvant.parent   = pGauche
    patte.parent    = pGauche
    couvG.parent    = pGauche

    pDroite.parent  = pAvant
    rAvH.parent     = pAvant
    rAvB.parent     = pAvant

    pArriere.parent = pDroite
    couvD.parent    = pDroite
    fondD.parent    = pDroite

    rArH.parent     = pArriere
    rArB.parent     = pArriere

    clA.parent = rAvH
    clC.parent = rAvB
    clB.parent = rArH
    clD.parent = rArB

    -- Lignes de pli qui bordent chaque pièce, dans le repère du patron.
    -- Une crêuse est partagée par deux pièces : elle est donc listée des
    -- deux côtés, chacune apportant la moitié de l'arrondi.
    global BC_PLIEDGES = #(
        #(pAvant,   #( #(#x, 281.0), #(#x, 604.0), #(#y, 328.5), #(#y, 164.5) )),
        #(pGauche,  #( #(#x, 281.0), #(#x, 35.0),  #(#y, 332.0), #(#y, 161.0) )),
        #(pDroite,  #( #(#x, 604.0), #(#x, 850.0), #(#y, 332.0), #(#y, 161.0) )),
        #(pArriere, #( #(#x, 850.0), #(#y, 328.5), #(#y, 164.5) )),
        #(patte,    #( #(#x, 35.0) )),
        #(couvG,    #( #(#y, 332.0) )),
        #(couvD,    #( #(#y, 332.0) )),
        #(fondG,    #( #(#y, 161.0) )),
        #(fondD,    #( #(#y, 161.0) )),
        #(rAvH,     #( #(#y, 328.5), #(#y, 411.5) )),
        #(rAvB,     #( #(#y, 164.5), #(#y, 81.5) )),
        #(rArH,     #( #(#y, 328.5), #(#y, 411.5) )),
        #(rArB,     #( #(#y, 164.5), #(#y, 81.5) )),
        #(clA,      #( #(#y, 411.5) )),
        #(clB,      #( #(#y, 411.5) )),
        #(clC,      #( #(#y, 81.5) )),
        #(clD,      #( #(#y, 81.5) ))
    )

    ------------------------------------------------- 5. épaisseur + congé
    -- IMPERATIF : avant tout pliage. Le patron est encore à plat, donc les
    -- coordonnées du maillage sont celles du tracé et les arêtes de pli se
    -- retrouvent par leur simple position.
    if BC_EPAISSIR then
    (
        format "-- Shell vers l'intérieur\n"
        for o in toutes do
        (
            local sh = shell()
            sh.innerAmount = BC_EPAISSEUR
            sh.outerAmount = 0.0
            sh.segments    = 1
            -- tranches et face interne sur un ID matière distinct
            sh.overrideMatID      = true ; sh.matID      = 2   -- tranches
            sh.overrideInnerMatID = true ; sh.matInnerID = 2   -- face interne
            addModifier o sh
            convertTo o Editable_Poly
        )

        if BC_CONGE > 0 then
        (
            format "-- congé sur les seules arêtes de pli (r = %)\n" BC_CONGE
            local TOL = 0.6

            for entree in BC_PLIEDGES do
            (
                local o = entree[1], lignes = entree[2]
                local sel = #{}
                local ne = polyop.getNumEdges o

                -- diagnostic : \u00e9tendue r\u00e9elle de la pi\u00e8ce en espace objet
                local bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, bz0 = 1e9, bz1 = -1e9
                for v = 1 to (polyop.getNumVerts o) do
                (
                    local p = polyop.getVert o v
                    bx0 = amin bx0 p.x ; bx1 = amax bx1 p.x
                    by0 = amin by0 p.y ; by1 = amax by1 p.y
                    bz0 = amin bz0 p.z ; bz1 = amax bz1 p.z
                )

                local trouve = #()
                for l in lignes do append trouve 0

                for e = 1 to ne do
                (
                    local vs = polyop.getEdgeVerts o e
                    local a = polyop.getVert o vs[1]
                    local b = polyop.getVert o vs[2]

                    -- uniquement la peau ext\u00e9rieure : z = 0
                    if (abs a.z) > TOL or (abs b.z) > TOL do continue

                    for li = 1 to lignes.count do
                    (
                        local l = lignes[li]
                        local va = (if l[1] == #x then a.x else a.y)
                        local vb = (if l[1] == #x then b.x else b.y)
                        if (abs (va - l[2])) < TOL and (abs (vb - l[2])) < TOL do
                        (
                            append sel e
                            trouve[li] += 1
                            exit
                        )
                    )
                )

                -- rapport par ligne de pli
                local detail = ""
                for li = 1 to lignes.count do
                    detail += (lignes[li][1] as string) + "=" + (lignes[li][2] as string) \
                            + ":" + (trouve[li] as string) + "  "
                format "   % [x % \u2192 %, y % \u2192 %, z % \u2192 %]  %\n" \
                       o.name (bx0 as integer) (bx1 as integer) (by0 as integer) (by1 as integer) \
                       (bz0 as integer) (bz1 as integer) detail

                if sel.numberSet == 0 then
                    format "      /!\\ aucune arête de pli sur %\n" o.name
                else
                (
                    polyop.setEdgeSelection o sel
                    local fait = false
                    try
                    (
                        o.chamferEdgeHeight   = BC_CONGE
                        o.chamferEdgeSegments = BC_CONGE_SEG
                        try (o.chamferEdgeSmooth = 1) catch ()
                        o.EditablePoly.buttonOp #ChamferEdges
                        fait = true
                    )
                    catch ()
                    if not fait do
                        try (polyop.chamferEdges o sel BC_CONGE) \
                        catch (format "   congé impossible sur %\n" o.name)
                    format "   % : % arête(s) de pli\n" o.name sel.numberSet
                )
                polyop.setEdgeSelection o #{}
            )
        )

        -- Contrôle final d'orientation : après Shell et congé, une face de la
        -- peau extérieure (z ≈ 0) doit regarder vers +Z, une face interne
        -- (z ≈ -épaisseur) vers -Z. Une seule qui désobéit rend en noir.
        for o in toutes do
        (
            local faux = #{}
            for f = 1 to (polyop.getNumFaces o) do
            (
                local n = polyop.getFaceNormal o f
                if (abs n.z) < 0.985 do continue          -- tranche ou congé
                local c = polyop.getFaceCenter o f
                local attendu = (if c.z > -BC_EPAISSEUR * 0.5 then 1.0 else -1.0)
                if n.z * attendu < 0 do append faux f
            )
            if faux.numberSet > 0 do
            (
                polyop.flipNormals o faux
                format "   % : % face(s) remise(s) d'aplomb\n" o.name faux.numberSet
            )
        )

        -- ID matière, posés explicitement après le congé :
        --   1 = impression, elle passe PAR-DESSUS les plis, donc les faces
        --       du congé la gardent
        --   2 = tranche cannelée, uniquement les bords de découpe
        --   3 = intérieur kraft
        format "-- ID matière : 1 impression (congés compris), 2 tranches, 3 intérieur\n"
        for entree in BC_PLIEDGES do
        (
            local o = entree[1], lignes = entree[2]
            local f1 = #{}, f2 = #{}, f3 = #{}
            local marge = (amax (BC_CONGE * 1.6) (BC_EPAISSEUR * 0.75))

            for f = 1 to (polyop.getNumFaces o) do
            (
                local n = polyop.getFaceNormal o f
                local c = polyop.getFaceCenter o f
                local dehors = c.z > -BC_EPAISSEUR * 0.5

                if (abs n.z) > 0.985 then
                (
                    -- face plate : peau imprimée ou intérieur
                    if dehors then append f1 f else append f3 f
                )
                else
                (
                    -- Tranche ou pli. Au droit d'une ligne de pli il n'y a
                    -- aucune découpe : la pièce voisine est dans la
                    -- continuité. Toute la hauteur de cette face porte donc
                    -- l'impression, congé compris — sinon on aperçoit la
                    -- cannelure dans le joint dès que le pli atteint 90°.
                    local surPli = false
                    for l in lignes do
                    (
                        local v = (if l[1] == #x then c.x else c.y)
                        if (abs (v - l[2])) < marge do ( surPli = true ; exit )
                    )
                    if surPli then append f1 f else append f2 f
                )
            )

            if f1.numberSet > 0 do polyop.setFaceMatID o f1 1
            if f2.numberSet > 0 do polyop.setFaceMatID o f2 2
            if f3.numberSet > 0 do polyop.setFaceMatID o f3 3
            update o
        )

        -- Groupes de lissage explicites. Un Smooth par angle mélangerait le
        -- premier segment du congé avec la face plate : les normales se
        -- contaminent le long de la triangulation et dessinent des triangles
        -- d'ombre. Ici les faces plates (normale ±Z, patron encore à plat)
        -- gardent le groupe 1, congés et tranches le groupe 2.
        for o in toutes do
        (
            local plates = #{}, courbes = #{}
            for f = 1 to (polyop.getNumFaces o) do
            (
                local n = polyop.getFaceNormal o f
                if (abs n.z) > 0.985 then append plates f else append courbes f
            )
            if plates.numberSet > 0 do polyop.setFaceSmoothGroup o plates 1
            if courbes.numberSet > 0 do polyop.setFaceSmoothGroup o courbes 2
            update o
        )
    )

    ------------------------------------------------- 6. pliage
    -- Phases successives, sans chevauchement. Chaque phase occupe une
    -- tranche égale de la durée totale.
    --   #(node, angle final, axe local)
    global BC_PHASES = #(
        #( "Parois", #(
            #(pAvant,    90.0, [0,1,0]),
            #(pDroite,   90.0, [0,1,0]),
            #(pArriere,  90.0, [0,1,0]),
            #(patte,    -90.0, [0,1,0]) )),
        #( "Cloisons basses", #(
            #(clC,       90.0, [1,0,0]),
            #(clD,       90.0, [1,0,0]) )),
        #( "Rabats bas", #(
            #(rAvB,      90.0, [1,0,0]),
            #(rArB,      90.0, [1,0,0]) )),
        -- fond_gauche étant la racine, c'est le reste de la boîte qui
        -- bascule sur lui : les deux fonds se ferment donc ensemble.
        #( "Fond", #(
            #(pGauche,  -90.0, [1,0,0]),
            #(fondD,     90.0, [1,0,0]) )),
        #( "Cloisons hautes", #(
            #(clA,      -90.0, [1,0,0]),
            #(clB,      -90.0, [1,0,0]) )),
        #( "Rabats haut", #(
            #(rAvH,     -90.0, [1,0,0]),
            #(rArH,     -90.0, [1,0,0]) )),
        #( "Couvercles", #(
            #(couvG,    -90.0, [1,0,0]),
            #(couvD,    -90.0, [1,0,0]) ))
    )

    -- Pose la rotation LOCALE absolue d'une pièce (repère du parent).
    -- On écrit directement dans le contrôleur : un contexte "in coordsys"
    -- ne survit pas à l'animation, les clés rejoueraient une rotation monde.
    -- À plat toutes les pièces ont la même orientation, donc l'axe de pli
    -- s'exprime directement dans les axes du patron.
    global bcPose
    fn bcPose n ang axe =
    (
        local q = (angleaxis (ang * BC_SENS) axe) as quat
        if n.parent == undefined then n.rotation = q
        else
        (
            try (n.rotation.controller.value = q)
            catch (in coordsys parent n.rotation = q)
        )
    )

    -- remet tout à plat puis applique le pourcentage global demandé
    global bcPlier
    fn bcPlier pct =
    (
        local n = BC_PHASES.count
        for i = 1 to n do
        (
            -- avancement propre à cette phase, adouci aux extrémités
            local u = (amin 1.0 (amax 0.0 (pct * n - (i - 1))))
            u = u * u * (3.0 - 2.0 * u)
            for p in BC_PHASES[i][2] do bcPose p[1] (p[2] * u) p[3]
        )
    )

    -- une phase isolée : bcPhase 3 1.0  ferme les rabats bas
    global bcPhase
    fn bcPhase idx u =
    (
        if idx >= 1 and idx <= BC_PHASES.count do
            for p in BC_PHASES[idx][2] do bcPose p[1] (p[2] * u) p[3]
    )

    if BC_ANIMER then
    (
        -- 20 images par phase : le montage se déroule dans l'ordre
        local nf = BC_PHASES.count * 20
        animationRange = interval 0 nf
        set animate on
        for f = 0 to nf do at time f bcPlier (f as float / nf)
        set animate off
        sliderTime = nf
        format "-- animation posée sur 0-% images (% phases)\n" nf BC_PHASES.count
    )
    else bcPlier 1.0

    -------------------------------------- 7. mise à l'endroit
    -- Le pliage se fait du côté non imprimé : la boîte se monte sous le
    -- plan de travail. On retourne la racine tout à la fin, une fois la
    -- chaîne entièrement liée et les clés posées. fond_gauche n'étant
    -- jamais animé, l'assemblage reste rigide et l'impression dehors.
    fondG.rotation = ((angleaxis 180 [1,0,0]) as quat)
    fondG.pos = [fondG.pos.x, fondG.pos.y, 0]

    -- la patte rentre d'une épaisseur pour passer derrière la paroi arrière
    if BC_PATTE != 0 do in coordsys local move patte [0, 0, -BC_PATTE]

    ------------------------------------------------------------------ fin
    select toutes
    max zoomext sel all
    format "\n== montage terminé : % pièces ==\n" toutes.count
    format "   bcPlier 0.0 / 0.5 / 1.0   -> montage complet\n"
    format "   bcPhase i u              -> une phase isolée, u de 0 à 1\n"
    for i = 1 to BC_PHASES.count do format "      % = %\n" i BC_PHASES[i][1]
)
