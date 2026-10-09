import { permanentRedirect } from "next/navigation";

/** Old link format (/r/slug) → /slug. */
export default async function Page(props: { params: Promise<{ slug: string }> }) {
  permanentRedirect(`/${encodeURIComponent((await props.params).slug)}`);
}
