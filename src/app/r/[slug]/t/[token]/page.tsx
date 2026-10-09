import { permanentRedirect } from "next/navigation";

/** Old table link format (/r/slug/t/token) → /slug/t/token (printed cards keep working). */
export default async function Page(props: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await props.params;
  permanentRedirect(`/${encodeURIComponent(slug)}/t/${encodeURIComponent(token)}`);
}
