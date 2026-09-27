import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { STUDIO_RECIPES, findRecipe } from "@/lib/studio";
import { generateStudioImage } from "@/lib/studioGenerate";

export const runtime = "nodejs";
export const maxDuration = 120;

// DEV-ONLY gallery seeder. Renders a recipe's example through the exact same
// generateStudioImage pipeline users get, so every gallery card is honest about
// what "Generate this" produces. Disabled in production.
//
//   curl -X POST localhost:3000/api/studio/seed -H "x-dev-key: $DEV_UNLIMITED_KEY" \
//        -H "Content-Type: application/json" -d '{"recipeId":"icon-mascot-face"}'

function guard(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const devKey = process.env.DEV_UNLIMITED_KEY;
  if (!devKey || req.headers.get("x-dev-key") !== devKey) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

/** Recipe ids to seed - keeps scripts/seed-gallery.mjs in sync with lib/studio. */
export async function GET(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;
  return NextResponse.json({ recipeIds: STUDIO_RECIPES.map((r) => r.id) });
}

export async function POST(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "no GEMINI_API_KEY" }, { status: 500 });

  const { recipeId } = (await req.json().catch(() => ({}))) as { recipeId?: string };
  const recipe = findRecipe(recipeId);
  if (!recipe) return NextResponse.json({ error: "unknown recipe" }, { status: 400 });

  try {
    const image = await generateStudioImage(
      {
        type: recipe.type,
        gameName: recipe.example.game,
        gamePitch: recipe.example.pitch,
        styleId: recipe.style,
        recipeId: recipe.id,
      },
      apiKey
    );
    const dir = path.join(process.cwd(), "public", "gallery");
    await mkdir(dir, { recursive: true });
    const webp = await sharp(Buffer.from(image.base64, "base64"))
      .resize(recipe.type === "icon" ? 640 : 920, null, { withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
    const file = path.join(dir, `${recipe.id}.webp`);
    await writeFile(file, webp);
    return NextResponse.json({ ok: true, file: `/gallery/${recipe.id}.webp`, bytes: webp.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 502 }
    );
  }
}
