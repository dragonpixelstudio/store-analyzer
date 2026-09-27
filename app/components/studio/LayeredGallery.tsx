"use client";
import { useEffect, useRef, useState } from "react";
import { LAYERED_TEMPLATES, layeredArtwork, type LayeredTemplate } from "@/lib/layeredTemplates";
import { renderArtwork } from "./renderArtwork";

function LayeredCard({ template, onUse, disabled }: { template: LayeredTemplate; onUse: (template: LayeredTemplate) => void; disabled: boolean }) {
  const host = useRef<HTMLElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void renderArtwork(layeredArtwork(template), undefined, false, 560).then(image => {
        if (cancelled || !canvas.current) return;
        canvas.current.width = image.width; canvas.current.height = image.height; canvas.current.getContext("2d")?.drawImage(image, 0, 0); setLoaded(true);
      }).catch(() => { if (!cancelled) setFailed(true); });
    }, { rootMargin: "250px" });
    if (host.current) observer.observe(host.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [template]);
  return <article ref={host} className="layered-card"><div className={`layered-art layered-art-${template.type}`}><canvas ref={canvas} role="img" aria-label={`${template.game} editable composition`} />{!loaded && <span>{failed ? "Preview unavailable" : "Loading composition…"}</span>}</div><div className="layered-card-copy"><div><h3>{template.title}</h3><span>{template.type} · 6 layers</span></div><button disabled={disabled} onClick={() => onUse(template)} aria-label={`Edit ${template.title}`}>Edit layers →</button></div></article>;
}
export default function LayeredGallery({ onUse, disabled }: { onUse: (template: LayeredTemplate) => void; disabled: boolean }) {
  return <section className="layered-gallery" aria-label="Editable compositions"><div className="idea-heading"><h2>Editable compositions</h2><span className="idea-count">Free to customize & export</span></div><p className="idea-intro">Separate artwork, text and accents. Make every layer yours.</p><div className="layered-grid">{LAYERED_TEMPLATES.map(template => <LayeredCard key={template.id} template={template} onUse={onUse} disabled={disabled} />)}</div></section>;
}
