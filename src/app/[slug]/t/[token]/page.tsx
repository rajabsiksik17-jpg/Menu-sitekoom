import { MenuPage, menuMetadata } from "../../menu-page";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  return menuMetadata((await props.params).slug);
}

/** Table menu: the secret token in the QR identifies the table; ordering is enabled when the table and service are active. */
export default async function Page(props: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await props.params;
  return <MenuPage slug={slug} token={token} />;
}
