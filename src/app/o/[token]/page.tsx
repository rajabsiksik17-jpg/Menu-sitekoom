import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { getTracking } from "@/server/orders";
import { isLang } from "@/lib/i18n";
import { TrackingView } from "@/components/menu/TrackingView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order", robots: { index: false } };

/** Customer order tracking (no account: the unguessable token in the link is the access). */
export default async function Page(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const data = await getTracking(await getDb(), token);
  if (!data) notFound();
  const c = (await cookies()).get("lang")?.value;
  const lang = isLang(c) ? c : data.order.lang === "en" ? "en" : "ar";
  return <TrackingView token={token} initial={data} lang={lang} />;
}
