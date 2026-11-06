"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select } from "@/components/ui/form";

/** Department dropdown that updates the URL (keeps filters shareable). */
export function DepartmentFilter({ departments, value, param = "dept", id = "dept-filter" }: {
  departments: { id: string; name: string }[]; value: string; param?: string; id?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <div className="w-full sm:w-56">
      <label htmlFor={id} className="sr-only">Filter by department</label>
      <Select id={id} value={value} onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value) next.set(param, e.target.value); else next.delete(param);
        const q = next.toString();
        router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
      }}>
        <option value="">All departments</option>
        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </Select>
    </div>
  );
}
