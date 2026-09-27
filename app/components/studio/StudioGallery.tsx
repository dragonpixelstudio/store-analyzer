"use client";
/* eslint-disable @next/next/no-img-element -- optimized local concept artwork */
import { useEffect, useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { SCREENSHOT_TEMPLATES, SHOT_DEMO_CAPTURES, SHOT_PALETTES, STUDIO_RECIPES, STUDIO_STYLES, galleryImagePath, type ScreenshotTemplate, type StudioRecipe, type StudioStyleId } from "@/lib/studio";
import { brandFontFamily, composeScreenshot, loadImage } from "./composeScreenshot";
type Filter = "all" | "icon" | "capsule" | "thumbnail" | "screenshot";
const filters: { id: Filter; label: string }[] = [{ id: "all", label: "All ideas" }, { id: "capsule", label: "Capsules" }, { id: "icon", label: "Icons" }, { id: "thumbnail", label: "Thumbnails" }, { id: "screenshot", label: "Screenshots" }];
function ScreenshotCard({ template, index, onUse }: { template: ScreenshotTemplate; index: number; onUse: () => void }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    void Promise.all([brandFontFamily(), loadImage(SHOT_DEMO_CAPTURES[index % SHOT_DEMO_CAPTURES.length])]).then(([fontFamily, capture]) => {
      const portrait = template.orientation === "portrait";
      const canvas = composeScreenshot({ capture, template, size: { id: "preview", label: "", width: portrait ? 405 : 720, height: portrait ? 720 : 405 }, palette: SHOT_PALETTES[index], headline: portrait ? "Survive the swarm" : "Turn the tide", subline: "Your gameplay. Your story.", fontFamily });
      if (!cancelled) setSrc(canvas.toDataURL("image/webp", .85));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [template, index]);
  return <article className="idea-card"><div className="idea-art shot" style={{ aspectRatio: template.orientation === "portrait" ? "9 / 12" : "16 / 9" }}>{src && <img src={src} alt={`${template.title}: actual gameplay in a screenshot layout`} loading="lazy" />}<span>Screenshot · free</span></div><div className="idea-copy"><h3>{template.title}</h3><p>{template.pattern}</p><button type="button" onClick={onUse}>Use layout <ArrowUpRight size={15} /></button></div></article>;
}
export default function StudioGallery({ availableImages, onRecipe, onTemplate, onStyle }: { availableImages: string[]; onRecipe: (recipe: StudioRecipe) => void; onTemplate: (template: ScreenshotTemplate) => void; onStyle: (style: StudioStyleId) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [imageErrors, setImageErrors] = useState<string[]>([]);
  const recipes = STUDIO_RECIPES.filter(recipe => availableImages.includes(recipe.id) && !imageErrors.includes(recipe.id));
  const ordered = [...recipes].sort((a, b) => {
    const rank = { capsule: 0, icon: 1, thumbnail: 2 };
    const index = (r: StudioRecipe) => recipes.filter(v => v.type === r.type).indexOf(r) * 3 + rank[r.type];
    return index(a) - index(b);
  });
  return <section id="gallery" className="idea-gallery" aria-label="Composition gallery"><div className="idea-heading"><div><h2>Concept gallery</h2></div><span className="idea-count">{recipes.length + SCREENSHOT_TEMPLATES.length} compositions</span></div><p className="idea-intro">Flattened concept art and gameplay layouts. Add your own layers in the editor.</p><div className="idea-filters" role="group" aria-label="Filter gallery">{filters.map(item => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div><div className="idea-grid">{ordered.filter(recipe => filter === "all" || recipe.type === filter).map(recipe => <article className="idea-card" key={recipe.id}><div className={`idea-art ${recipe.type}`}><img src={galleryImagePath(recipe.id)} alt={`${recipe.example.game} — ${recipe.title} concept artwork`} loading="lazy" decoding="async" onError={() => setImageErrors(prev => [...prev, recipe.id])} /><span>{recipe.type}</span></div><div className="idea-copy"><div className="idea-game">{recipe.example.game}</div><h3>{recipe.title}</h3><p>{recipe.pattern} · {STUDIO_STYLES.find(style => style.id === recipe.style)?.label}</p><button type="button" onClick={() => onRecipe(recipe)}>Use composition <ArrowUpRight size={15} /></button></div></article>)}{(filter === "all" || filter === "screenshot") && SCREENSHOT_TEMPLATES.map((template, index) => <ScreenshotCard key={template.id} template={template} index={index} onUse={() => onTemplate(template)} />)}</div><details className="idea-style-list"><summary>Explore all {STUDIO_STYLES.length} art styles</summary><div>{STUDIO_STYLES.map(style => <button type="button" key={style.id} onClick={() => onStyle(style.id)}><strong>{style.label}</strong><span>{style.blurb}</span></button>)}</div></details></section>;
}
