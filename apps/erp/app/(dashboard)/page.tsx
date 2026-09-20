import Link from "next/link";
import { Banknote, Package, ShieldCheck, Users } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CreditLimitIndicator,
  InventoryStatusBadge,
  MetalRateDisplay,
  MetricCard,
} from "@jewellery/ui";
import { RecentOrdersTable } from "../../components/recent-orders-table";

/**
 * Illustrative dashboard content only — no data layer exists yet (see docs/progress.md, Phase 1+).
 * Kept isolated here rather than in a shared/service file so it can't be mistaken for real data.
 */
const PLACEHOLDER_METRICS = [
  { label: "Today's sales", value: "₹8,42,300", change: { value: "12.4%", direction: "up" as const }, icon: Banknote },
  { label: "Orders today", value: "24", change: { value: "4 pending", direction: "up" as const, tone: "negative" as const }, icon: Package },
  { label: "Outstanding (B2B)", value: "₹24,10,000", icon: Users },
  { label: "Pending hallmarking", value: "7", icon: ShieldCheck },
];

const PLACEHOLDER_ORDERS = [
  { id: "SO-2451", customer: "Anand Jewellers", channel: "B2B", status: "CONFIRMED" as const, amount: 214000 },
  { id: "SO-2450", customer: "Rina Patel", channel: "B2C", status: "PENDING_PAYMENT" as const, amount: 41500 },
  { id: "SO-2449", customer: "Royal Ornaments", channel: "B2B", status: "FULFILLED" as const, amount: 118000 },
  { id: "SO-2448", customer: "Karan Mehta", channel: "B2C", status: "FULFILLED" as const, amount: 28500 },
];

const PLACEHOLDER_JOB_WORK = [
  { code: "JW-1042", item: "Rihaan Ring 22K", status: "WITH_JOB_WORKER" as const },
  { code: "JW-1041", item: "Meher Studs 18K", status: "HALLMARKING" as const },
  { code: "JW-1039", item: "Kabir Chain 22K", status: "AVAILABLE" as const },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLACEHOLDER_METRICS.map((m) => (
          <MetricCard key={m.label} label={m.label} value={m.value} change={m.change} icon={<m.icon className="h-4 w-4" />} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent orders</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentOrdersTable orders={PLACEHOLDER_ORDERS} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gold rate</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <MetalRateDisplay metalType="GOLD" purity="22K" ratePerGram={6842} asOf="10:32 AM" change={{ percent: 0.8, direction: "up" }} />
            <MetalRateDisplay metalType="GOLD" purity="18K" ratePerGram={5620} asOf="10:32 AM" change={{ percent: 0.8, direction: "up" }} />
            <MetalRateDisplay metalType="SILVER" purity="999" ratePerGram={86.5} asOf="10:32 AM" change={{ percent: 0.3, direction: "down" }} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>B2B credit at a glance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-body-sm font-medium text-foreground">Anand Jewellers</p>
              <CreditLimitIndicator creditLimit={2500000} outstanding={2180000} overdueAmount={64000} />
            </div>
            <div>
              <p className="mb-2 text-body-sm font-medium text-foreground">Royal Ornaments</p>
              <CreditLimitIndicator creditLimit={1500000} outstanding={420000} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job work in progress</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {PLACEHOLDER_JOB_WORK.map((j) => (
              <div key={j.code} className="flex items-center justify-between text-body-sm">
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{j.code}</span>
                  <span className="text-muted">{j.item}</span>
                </div>
                <InventoryStatusBadge status={j.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/sales/orders">Sales orders</Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/inventory/products">Inventory</Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/b2b/customers">B2B customers</Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/production/job-work">Job work</Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/metals/gold-rates">Gold rates</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
