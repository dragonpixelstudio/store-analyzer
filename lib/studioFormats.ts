import { STUDIO_SPECS, type StudioAiType, type StudioSpec } from "./studio";
export type StudioFormat = StudioSpec & { id: string; type: StudioAiType };
export const STUDIO_FORMATS: StudioFormat[] = [
  { ...STUDIO_SPECS.icon, id: "app-icon", type: "icon" },
  { ...STUDIO_SPECS.icon, id: "play-icon", type: "icon", label: "Google Play icon", width: 512, height: 512, sizeNote: "512×512 · Google Play icon" },
  { ...STUDIO_SPECS.capsule, id: "steam-header", type: "capsule" },
  { id: "steam-small", type: "capsule", label: "Steam small capsule", width: 462, height: 174, geminiAspect: "21:9", sizeNote: "462×174 · Steam small capsule" },
  { id: "steam-main", type: "capsule", label: "Steam main capsule", width: 1232, height: 706, geminiAspect: "16:9", sizeNote: "1232×706 · Steam main capsule" },
  { id: "steam-vertical", type: "capsule", label: "Steam vertical capsule", width: 748, height: 896, geminiAspect: "4:5", sizeNote: "748×896 · Steam vertical capsule" },
  { id: "steam-library", type: "capsule", label: "Steam library capsule", width: 600, height: 900, geminiAspect: "2:3", sizeNote: "600×900 · Steam library capsule" },
  { ...STUDIO_SPECS.thumbnail, id: "video-hd", type: "thumbnail" },
  { ...STUDIO_SPECS.thumbnail, id: "video-4k", type: "thumbnail", width: 3840, height: 2160, sizeNote: "3840×2160 · YouTube desktop recommendation" },
  { ...STUDIO_SPECS.thumbnail, id: "shorts", type: "thumbnail", label: "Shorts thumbnail", width: 2160, height: 3840, geminiAspect: "9:16", sizeNote: "2160×3840 · Shorts thumbnail" },
];
export function studioFormat(type: StudioAiType, id?: string): StudioFormat {
  return STUDIO_FORMATS.find(f => f.type === type && f.id === id) ?? STUDIO_FORMATS.find(f => f.type === type)!;
}
