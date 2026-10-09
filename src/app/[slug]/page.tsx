import { MenuPage, menuMetadata } from "./menu-page";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  return menuMetadata((await props.params).slug);
}

/** Public browse-only menu of a restaurant (ordering needs a table QR). */
export default async function Page(props: { params: Promise<{ slug: string }> }) {
  return <MenuPage slug={(await props.params).slug} token={null} />;
}
