import { notFound } from "next/navigation";
import { Play } from "lucide-react";
import { TEST_ITEMS } from "@/lib/content/test-catalogue";
import { artFor } from "@/app/chat/art";

export const metadata = { title: "Calm", robots: { index: false, follow: false } };

/** Placeholder for a Calm app deep link (test only). */
export default async function CalmPlaceholder({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = TEST_ITEMS.find((t) => t.slug === slug);
  if (!item) notFound();
  const art = artFor(item.category);
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center text-white" style={{ background: art.bg }}>
      <div className="mb-6 text-[56px]">{art.emoji}</div>
      <div className="text-[13px] font-medium uppercase tracking-[0.12em] text-white/70">
        {item.kind} · {item.minutes} min
      </div>
      <h1 className="mt-2 max-w-sm text-[28px] font-semibold leading-tight">{item.title}</h1>
      <p className="mt-2 max-w-sm text-[15px] text-white/80">{item.description}</p>
      <div className="mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-ink shadow-pop">
        <Play className="ml-1 h-7 w-7" />
      </div>
      <p className="mt-10 max-w-xs rounded-2xl bg-black/20 px-4 py-3 text-[12.5px] text-white/85">
        Test placeholder: in the real version this link opens this {item.kind.toLowerCase()} in the Calm app.
      </p>
    </div>
  );
}
