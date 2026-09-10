# Research: Mii-style avatar builder assets (2026-09-09)

## 3D asset packs (glTF-capable)
| Pack | License | Separable parts | Rigged | Verdict |
|---|---|---|---|---|
| Quaternius Universal Base Characters | CC0 | free tier: Superhero M/F full bodies, 6 hairstyles + 2 eyebrows (paid "Source" has 6 bodies × 3 proportions, 20 hairstyles) | UE-mannequin bone names, no anims | **used** |
| Quaternius Modular Character Outfits – Fantasy | CC0 | free tier: Peasant + Ranger, M/F, split into Arms/Body/Legs/Feet/Head/Acc | same rig | **used** |
| Quaternius Universal Animation Library | CC0 | 43 clips (Idle_Loop, Walk_Loop, Jog, Sprint, Idle_Talking_Loop, Death01, Sword_Attack, Spell_*, Sitting_*, …) | same rig | **used** |
| Kenney Mini/Blocky Characters | CC0 | hair/clothes baked into PNG skins | yes | skins only |
| KayKit Adventurers | CC0 | weapons separate, clothes baked | yes | no |
| Mixamo | free commercial, no redistribution of files | no | yes | animations only |
| Synty | paid, no redistribution | yes | yes | avoid for web bundles |
| MakeHuman/MPFB | CC0 exports | yes | yes | realistic, manual Blender work |
| VRoid/VRM | forbids apps that combine their meshes | yes | yes | avoid |
| Ready Player Me | shut down 2026-01-31 | – | – | gone |
| AI generators (Meshy, Tripo, Rodin, Sloyd) | commercial on paid plans; Luma Genie non-commercial | single unrigged blobs | no | not realistic for modular parts |

## How Miis work
Head mesh + face texture; eyes/brows/mouth/mole drawn as 2D textured quads into a render target on a mask mesh in front of the face (so parts slide/rotate/scale freely); nose, hair, glasses, beard are separate meshes; body is a simple scaled mesh. Three.js recipe: sphere/capsule body, `CanvasTexture` face drawn from 2D part definitions, bone scaling for height/width (scale hips/spine, keep head at 1).

## 2D
Layer order (back→front): back hair → back arm → legs → shoes → bottoms → torso → top → front arm → neck → head → face parts → front hair → hat/accessories. Held items swap slots. Kits: Kenney Modular Characters 2D (CC0, vector source), Open Peeps (CC0 SVG full-body), Humaaans (CC0), Big Heads (MIT, bust), DiceBear (code MIT, styles CC0 or CC-BY, mostly bust), LPC (CC-BY-SA/GPL, pixel, share-alike). Claude-authored SVG parts on a fixed grid with anchors + CSS-variable recoloring is feasible and keeps one JSON driving both 2D and 3D. Height: scale the legs group about the feet, translate torso/head; width: scale torso/legs about center X; never scale the head.

Sources: quaternius.com packs; kenney.nl; kaylousberg.itch.io; helpx.adobe.com Mixamo FAQ; static.makehumancommunity.org MPFB FAQ; vroid.com guidelines; variety.com RPM acquisition; sloyd.ai price comparison; dicebear.com/licenses; openpeeps.com; humaaans.com; github.com/RobertBroersma/beanheads; LPC generator repo; rimworldwiki Apparel_layers; github.com/jaames/mii-assets.
