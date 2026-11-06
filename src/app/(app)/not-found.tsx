import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-6 max-w-lg">
      <EmptyState icon={SearchX} title="We couldn't find that page" action={<ButtonLink href="/">Back to Home</ButtonLink>}>
        It may have been removed, or it isn't shared with you. If you think you should have access, ask an administrator.
      </EmptyState>
    </div>
  );
}
