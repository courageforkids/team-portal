import { ResetForm } from "./form";
export const metadata = { title: "Choose a new password" };
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (<><h1 className="text-lg font-bold">Choose a new password</h1><p className="mb-5 text-sm text-muted">You'll be signed out on other devices.</p><ResetForm token={token} /></>);
}
