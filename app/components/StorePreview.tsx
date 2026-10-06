"use client";
/* eslint-disable @next/next/no-img-element -- local upload URLs and private report previews */
import { useState } from "react";
export type StorePreviewAsset = { src: string; kind: string; width: number; height: number; label?: string };
type Platform = "steam" | "google-play" | "app-store";
const stores: { id: Platform; name: string }[] = [{ id: "steam", name: "Steam" }, { id: "google-play", name: "Google Play" }, { id: "app-store", name: "App Store" }];
export default function StorePreview({ assets, title = "Your game", platform = "steam" }: { assets: StorePreviewAsset[]; title?: string; platform?: string }) {
  const [store, setStore] = useState<Platform>(platform === "app-store" || platform === "google-play" ? platform : "steam");
  const [placement, setPlacement] = useState(assets.some(asset => asset.kind === "steamCapsule" && asset.height > asset.width) ? "discovery" : "detail");
  const [selected, setSelected] = useState(-1);
  const [crop, setCrop] = useState(false);
  const [highlight, setHighlight] = useState(true);
  const [shotIndex, setShotIndex] = useState(0);
  const uploaded = assets.filter(asset => asset.src);
  if (!uploaded.length) return null;
  const main = uploaded[selected] ?? uploaded.find(asset => asset.kind === (store === "steam" ? "steamCapsule" : "icon")) ?? uploaded[0];
  const shots = uploaded.filter(asset => asset.kind === "screenshot");
  const shot = shots[shotIndex] ?? shots[0];
  const feature = uploaded.find(asset => asset.kind === "featureGraphic");
  const name = title.trim() || "Your game";
  const discovery = placement === "discovery";
  const storeName = stores.find(item => item.id === store)!.name;
  const art = <img className="listing-art" src={main.src} alt={name + " uploaded artwork"} style={{ objectFit: crop ? "cover" : "contain" }} />;
  const screenshot = shot ? <img src={shot.src} alt="Uploaded gameplay screenshot" /> : <div className="listing-missing"><span aria-hidden="true">▧</span><span>Add gameplay screenshots</span></div>;
  return <section className="store-preview" aria-label="Store preview simulator">
    <header className="store-preview-heading"><div><p className="product-eyebrow">IN CONTEXT</p><h2>See it on the shelf</h2></div><span className="preview-free">Free preview</span></header>
    <div className="store-preview-toolbar"><div className="preview-tabs" role="group" aria-label="Preview store">{stores.map(item => <button key={item.id} type="button" aria-pressed={store === item.id} onClick={() => { setStore(item.id); setSelected(-1); }}>{item.name}</button>)}</div><label>View<select aria-label="Listing placement" value={placement} onChange={event => setPlacement(event.target.value)}><option value="discovery">{store === "steam" ? "Discovery list" : "Search results"}</option><option value="detail">{store === "steam" ? "Compact search" : "Product page"}</option></select></label></div>
    <div className="listing-stage" data-store={store} data-placement={placement}>
      {store === "steam" ? <div className="steam-preview">
        <div className="steam-preview-nav"><strong>STORE</strong><span>Discover</span><span>Categories</span><span>Your wishlist</span></div>
        <div className="steam-list-heading">{discovery ? "More games to discover" : "Search results"}<span>Simulated listings</span></div>
        {[false, true, false].map((yours, i) => <article key={i} className={"steam-listing " + (yours ? "your-listing" : "sample-listing")} data-highlight={yours && highlight}>
          <div className="steam-listing-art" style={{ aspectRatio: discovery ? "748 / 896" : "462 / 174" }}>{yours ? art : <img src={i === 0 ? "/gallery/thumbnail-space.webp" : "/gallery/thumbnail-racing.webp"} alt="Fictional neighboring game artwork" />}</div>
          <div className="steam-listing-copy"><span className="listing-kicker">{yours ? "YOUR ARTWORK" : "SAMPLE GAME"}</span><h3>{yours ? name : i === 0 ? "Beyond the stars" : "After dark"}</h3><p>{yours ? "See how your title, subject and contrast read beside other games." : "Example listing for visual comparison."}</p><div className="listing-tags"><span>{yours ? "Your genre" : "Adventure"}</span><span>Indie</span></div></div>
          {discovery && <div className="steam-listing-media">{yours ? <>{screenshot}<div className="listing-shot-thumbs">{shots.map((asset, index) => <button type="button" key={index} aria-label={"Preview screenshot " + (index + 1)} aria-pressed={shotIndex === index} onClick={() => setShotIndex(index)}><img src={asset.src} alt="" /></button>)}</div></> : <div className="sample-gameplay"><span>Sample listing</span></div>}</div>}
        </article>)}
      </div> : <div className={"mobile-store " + (store === "app-store" ? "ios-store" : "android-store")}>
        <div className="mobile-store-status"><span>9:41</span><span aria-hidden="true">▰ ▰ ▰</span></div><div className="mobile-store-nav"><span>{discovery ? "Search" : "‹ Games"}</span><strong>{storeName}</strong></div>
        {discovery && <div className="mobile-search-query">Games for you <span aria-hidden="true">⌕</span></div>}
        {discovery && <div className="mobile-neighbor"><img src="/gallery/icon-cozy-companion.webp" alt="Fictional neighboring app icon" /><div><strong>Little forest</strong><small>Sample game</small></div><span className="mobile-install">{store === "app-store" ? "GET" : "Install"}</span></div>}
        <article className="mobile-your-listing" data-highlight={highlight}><div className="mobile-app-heading"><div className="mobile-app-icon">{art}</div><div><span className="listing-kicker">YOUR ARTWORK</span><h3>{name}</h3><p>Your studio</p></div><span className="mobile-install">{store === "app-store" ? "GET" : "Install"}</span></div>
          {!discovery && <div className="mobile-app-details"><span>Game</span><span>No ratings shown</span><span>Preview</span></div>}
          {!discovery && store === "google-play" && feature && <img className="play-feature" src={feature.src} alt="Uploaded Google Play feature graphic" />}
          <div className="mobile-screenshots">{shots.length ? shots.map((asset, index) => <img src={asset.src} key={index} alt={"Uploaded screenshot " + (index + 1)} />) : <div className="mobile-shot-placeholder">Add screenshots to preview the full listing</div>}</div>
        </article>
        {discovery && <div className="mobile-neighbor"><img src="/gallery/icon-hero-action.webp" alt="Fictional neighboring app icon" /><div><strong>Neon patrol</strong><small>Sample game</small></div><span className="mobile-install">{store === "app-store" ? "GET" : "Install"}</span></div>}
        <div className="mobile-home-line" aria-hidden="true" />
      </div>}
    </div>
    <div className="store-preview-controls"><label>Artwork<select aria-label="Preview artwork" value={selected} onChange={event => setSelected(Number(event.target.value))}><option value={-1}>Auto-select</option>{uploaded.map((asset, index) => <option value={index} key={index}>{asset.label || "Image " + (index + 1)}</option>)}</select></label><label className="preview-check"><input type="checkbox" checked={crop} onChange={event => setCrop(event.target.checked)} />Fill frame</label><label className="preview-check"><input type="checkbox" checked={highlight} onChange={event => setHighlight(event.target.checked)} />Highlight mine</label><span>{main.width} × {main.height}</span></div>
    <footer>{store === "steam" && discovery && main.width > main.height && <span>Discovery uses a vertical capsule. Your landscape artwork is fitted for comparison.</span>}<span>Simulated layout. Preview controls do not change your score or export.</span>{store !== "steam" && main.kind !== "icon" && <span>This artwork is being fitted into the icon slot.</span>}</footer>
  </section>;
}
