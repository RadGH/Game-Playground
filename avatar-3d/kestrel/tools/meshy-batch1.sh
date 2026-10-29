#!/usr/bin/env bash
# Meshy batch 1 (2026-10-27): three settings x two bodies. Re-running repeats the spend.
cd /home/radgh/claude/playground
T=avatar-3d/kestrel/tools/meshy.mjs; R=avatar-3d/kestrel/ref; O=avatar-3d/kestrel/meshy/runs
for g in male female; do
  node $T run multi-image-to-3d "{\"image_urls\":[\"@$R/$g-crop-front.png\",\"@$R/$g-crop-left.png\",\"@$R/$g-crop-back.png\",\"@$R/$g-crop-right.png\"],\"ai_model\":\"meshy-7.1\",\"should_texture\":true,\"enable_pbr\":true,\"texture_resolution\":\"2k\",\"should_remesh\":true,\"topology\":\"triangle\",\"target_polycount\":12000,\"pose_mode\":\"a-pose\",\"image_enhancement\":false,\"target_formats\":[\"glb\"],\"multi_view_thumbnails\":true}" $O/$g-multi &
  node $T run image-to-3d "{\"image_url\":\"@$R/$g-front.png\",\"ai_model\":\"meshy-7.1\",\"should_texture\":true,\"enable_pbr\":true,\"texture_resolution\":\"2k\",\"should_remesh\":true,\"topology\":\"triangle\",\"target_polycount\":12000,\"pose_mode\":\"a-pose\",\"image_enhancement\":false,\"target_formats\":[\"glb\"],\"multi_view_thumbnails\":true}" $O/$g-single &
  node $T run image-to-3d "{\"image_url\":\"@$R/$g-front.png\",\"ai_model\":\"meshy-t2.5\",\"model_type\":\"smart-topology\",\"target_polycount\":10000,\"should_texture\":true,\"enable_pbr\":true,\"pose_mode\":\"a-pose\",\"target_formats\":[\"glb\"],\"multi_view_thumbnails\":true}" $O/$g-lowpoly &
done
wait
node $T balance
