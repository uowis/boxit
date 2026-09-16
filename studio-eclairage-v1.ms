/*───────────────────────────────────────────────────────────────────────────
  ÉCLAIRAGE STUDIO — carton imprimé
  Ciel + clé + contre-jour + sol. Rendu Arnold.
  À lancer après le montage de la boîte. Scripting > Run Script.
───────────────────────────────────────────────────────────────────────────*/
(
    clearListener()

    global BCL_ECHELLE = 1.0     -- 1.0 si la scène est en millimètres
    global BCL_SOL     = true    -- créer le sol
    global BCL_HDRI    = ""      -- chemin d'un .hdr ; vide = Physical Sky

    local mm = BCL_ECHELLE

    -- cadrer sur ce qui existe déjà --------------------------------------
    local cibles = for o in geometry where not o.isHidden collect o
    local c = [0,0,0], rayon = 300.0 * mm
    if cibles.count > 0 do
    (
        local mn = cibles[1].min, mx = cibles[1].max
        for o in cibles do
        (
            mn = [amin mn.x o.min.x, amin mn.y o.min.y, amin mn.z o.min.z]
            mx = [amax mx.x o.max.x, amax mx.y o.max.y, amax mx.z o.max.z]
        )
        c = (mn + mx) / 2.0
        rayon = (length (mx - mn)) / 2.0
    )
    format "-- cible [%] rayon % \n" c rayon

    -- nettoyage d'un passage précédent -----------------------------------
    delete (for o in objects where (matchPattern o.name pattern:"STUDIO_*") collect o)

    -- 1. le ciel ---------------------------------------------------------
    local ciel = Arnold_Light name:"STUDIO_ciel"
    ciel.type = 6                       -- skydome
    ciel.intensity = 1.0
    ciel.exposure = 0.0
    ciel.samples = 3
    if BCL_HDRI != "" and doesFileExist BCL_HDRI then
        ciel.color_map = bitmapTexture filename:BCL_HDRI
    else
        try (ciel.color_map = Physical_Sky()) catch ()

    -- 2. la clé ----------------------------------------------------------
    local cle = Arnold_Light name:"STUDIO_cle"
    cle.type = 2                        -- quad
    cle.quad_x = 600.0 * mm
    cle.quad_y = 400.0 * mm
    cle.intensity = 1.0
    cle.exposure = 10.0
    cle.normalize = true
    cle.samples = 3
    cle.pos = c + [-1.1, -1.2, 1.4] * rayon
    cle.target = point name:"STUDIO_cle_cible" pos:c size:(20*mm)
    cle.targeted = true

    -- 3. le contre-jour --------------------------------------------------
    local contre = Arnold_Light name:"STUDIO_contre"
    contre.type = 2
    contre.quad_x = 500.0 * mm
    contre.quad_y = 500.0 * mm
    contre.intensity = 1.0
    contre.exposure = 8.0
    contre.normalize = true
    contre.samples = 3
    contre.pos = c + [1.3, 1.1, 0.9] * rayon
    contre.target = point name:"STUDIO_contre_cible" pos:c size:(20*mm)
    contre.targeted = true

    -- 4. le sol ----------------------------------------------------------
    if BCL_SOL do
    (
        local sol = plane name:"STUDIO_sol" length:(rayon*10) width:(rayon*10) \
                          lengthsegs:1 widthsegs:1
        sol.pos = [c.x, c.y, 0]
        local m = PhysicalMaterial name:"STUDIO_sol_mat"
        m.base_color = color 235 233 228
        m.roughness = 0.6
        m.metalness = 0.0
        sol.material = m
    )

    -- 5. la caméra -------------------------------------------------------
    local cam = Physical name:"STUDIO_camera" targeted:true
    cam.pos = c + [1.6, -2.0, 1.0] * rayon
    cam.target = point name:"STUDIO_camera_cible" pos:c size:(20*mm)
    try (cam.targeted = true) catch ()
    try (cam.focal_length_mm = 85.0) catch ()
    viewport.setCamera cam

    -- 6. réglages de rendu ----------------------------------------------
    try
    (
        renderers.current = Arnold()
        renderers.current.AA_samples = 3
        renderers.current.GI_diffuse_samples = 2
        renderers.current.GI_specular_samples = 2
    )
    catch (format "-- Arnold indisponible, réglages de rendu inchangés\n")

    select #(ciel, cle, contre)
    format "\n== studio en place ==\n"
    format "   $STUDIO_cle.exposure     -> intensité de la clé (10)\n"
    format "   $STUDIO_contre.exposure  -> contre-jour (8)\n"
    format "   $STUDIO_ciel.intensity   -> ambiance générale (1.0)\n"
)
