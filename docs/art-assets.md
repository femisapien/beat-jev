# Art assets

The game ships the finished GLB models and textures. Blender is an optional authoring tool, not a runtime or deployment dependency. Credits are available in the game under **How it works → Asset credits**.

To rebuild the characters, use Blender 4.5 LTS and MPFB 2.0.17. From the repository root:

1. Extract the [MPFB source package](https://static.makehumancommunity.org/mpfb/downloads.html) so `work/art-tools/mpfb-source/mpfb/__init__.py` exists.
2. Extract the MakeHuman [system assets, shirts01, pants03, underwear04 and gloves01 packs](https://static.makehumancommunity.org/assets/assetpacks.html) into `work/art-tools/assets`. Preserve the `skins`, `hair`, `clothes` and other directories.
3. Run the recipes with your Blender executable:

```sh
blender --background --factory-startup --python scripts/prepare-character.py
blender --background --factory-startup --python scripts/prepare-crowd.py
```

The recipes isolate MPFB's generated files inside `work/art-tools`. They fit the kit, preserve the rig, remove overlapping sock/boot geometry and export the models. The crowd recipe bakes a seated pose and reduces the mesh for instancing. Keep the credits alongside any redistributed model.

The stadium, goal and ball are procedural geometry. Grass005 color/normal maps and Stadium 01 HDR lighting remain in `frontend/public/textures` with their licenses. `Footballer.tsx` owns kit colors and bone poses; `Stadium.tsx` owns the environment. Neither changes Jev's decisions or Render task execution.
