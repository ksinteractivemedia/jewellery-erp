"use client";

import * as React from "react";
import {
  BadgeCheck,
  Banknote,
  Command as CommandIcon,
  Gem,
  LayoutGrid,
  Package,
  RotateCcw,
  Settings,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import {
  Alert,
  Badge,
  Breadcrumb,
  BulkActionBar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Combobox,
  CommandPalette,
  ConfirmDialog,
  CreditLimitIndicator,
  CurrencyDisplay,
  CurrencyInput,
  DataTable,
  type DataTableColumn,
  DataToolbar,
  DatePicker,
  DetailPanel,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  FilterBar,
  FormField,
  FormSection,
  HUIDDisplay,
  Input,
  InventoryStatusBadge,
  Label,
  MarginDisplay,
  MetalRateDisplay,
  MetricCard,
  OrderStatusBadge,
  PageHeader,
  Pagination,
  PercentageInput,
  PriceBreakdown,
  PurityBadge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SearchInput,
  SectionHeader,
  Skeleton,
  StatusBadge,
  StockLocationBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  WeightBreakdown,
  WeightInput,
  toast,
} from "@jewellery/ui";
import { ThemeToggle } from "./theme-toggle";

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-border-subtle py-10 first:pt-0 last:border-b-0">
      <SectionHeader title={title} description={description} />
      {children}
    </section>
  );
}

const anchors = [
  { id: "tokens", label: "Tokens" },
  { id: "typography", label: "Typography" },
  { id: "actions", label: "Actions & forms" },
  { id: "feedback", label: "Badges & status" },
  { id: "cards", label: "Cards & metrics" },
  { id: "data", label: "Data & tables" },
  { id: "navigation", label: "Navigation" },
  { id: "overlays", label: "Overlays" },
  { id: "jewellery", label: "Jewellery components" },
];

interface InventoryRow {
  id: string;
  itemCode: string;
  product: string;
  purity: string;
  netWeight: number;
  status: "AVAILABLE" | "RESERVED" | "SOLD" | "WITH_JOB_WORKER" | "HALLMARKING";
  location: string;
  cost: number;
  price: number;
}

const mockInventory: InventoryRow[] = [
  { id: "1", itemCode: "INV-1001", product: "Aarna Bangle 22K", purity: "22K", netWeight: 18.42, status: "AVAILABLE", location: "Main Store", cost: 92000, price: 118000 },
  { id: "2", itemCode: "INV-1002", product: "Zaira Necklace 18K", purity: "18K", netWeight: 34.1, status: "RESERVED", location: "Main Store", cost: 168000, price: 214000 },
  { id: "3", itemCode: "INV-1003", product: "Rihaan Ring 22K", purity: "22K", netWeight: 6.2, status: "WITH_JOB_WORKER", location: "Karigar — Zaveri Bazaar", cost: 31000, price: 41500 },
  { id: "4", itemCode: "INV-1004", product: "Meher Studs 18K", purity: "18K", netWeight: 4.05, status: "HALLMARKING", location: "BIS Hallmarking Centre", cost: 21000, price: 28500 },
  { id: "5", itemCode: "INV-1005", product: "Kabir Chain 22K", purity: "22K", netWeight: 22.8, status: "SOLD", location: "Andheri Counter", cost: 114000, price: 146000 },
];

export default function ShowcasePage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [drawerSide, setDrawerSide] = React.useState<"right" | "left" | "bottom" | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [page, setPage] = React.useState(1);
  const [metal, setMetal] = React.useState("gold-22k");
  const [customer, setCustomer] = React.useState("");
  const [date, setDate] = React.useState<Date | undefined>(new Date());
  const [amount, setAmount] = React.useState<number | undefined>(214000);
  const [weight, setWeight] = React.useState<number | undefined>(18.42);
  const [wastage, setWastage] = React.useState<number | undefined>(6);
  const [search, setSearch] = React.useState("");
  const [loadingDemo, setLoadingDemo] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const columns: DataTableColumn<InventoryRow>[] = [
    { id: "itemCode", header: "Item code", cell: (r) => <span className="tabular font-medium">{r.itemCode}</span>, sortable: true },
    { id: "product", header: "Product", cell: (r) => r.product },
    { id: "purity", header: "Purity", cell: (r) => <PurityBadge purity={r.purity} />, mobileHidden: true },
    { id: "netWeight", header: "Net weight", cell: (r) => <span className="tabular">{r.netWeight.toFixed(3)} g</span>, align: "right", sortable: true },
    { id: "status", header: "Status", cell: (r) => <InventoryStatusBadge status={r.status} /> },
    { id: "location", header: "Location", cell: (r) => <StockLocationBadge name={r.location} type="STORE" />, mobileHidden: true },
    { id: "price", header: "Price", cell: (r) => <CurrencyDisplay amount={r.price} size="sm" />, align: "right" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="flex items-center justify-between gap-3 py-6">
          <PageHeader
            title="Design System"
            description="Foundational tokens and components shared by the ERP, B2C storefront and B2B portal. No business logic lives here."
            className="pb-0"
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPaletteOpen(true)}>
              <CommandIcon className="h-4 w-4" /> ⌘K
            </Button>
            <ThemeToggle />
          </div>
        </div>

        <nav aria-label="Showcase sections" className="mb-6 flex flex-wrap gap-1.5 border-b border-border-subtle pb-6">
          {anchors.map((a) => (
            <a
              key={a.id}
              href={`#${a.id}`}
              className="rounded-full border border-border px-3 py-1 text-body-sm text-muted transition-colors hover:border-primary hover:text-foreground"
            >
              {a.label}
            </a>
          ))}
        </nav>

        {/* ---------------- TOKENS ---------------- */}
        <Section id="tokens" title="Color tokens" description="Semantic tokens only — no component ever hardcodes a hex value.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["background", "bg-background border border-border"],
              ["surface", "bg-surface border border-border"],
              ["surface-elevated", "bg-surface-elevated border border-border"],
              ["surface-sunken", "bg-surface-sunken border border-border"],
              ["foreground", "bg-foreground"],
              ["muted", "bg-muted"],
              ["border", "bg-border"],
              ["primary", "bg-primary"],
              ["primary-hover", "bg-primary-hover"],
              ["success", "bg-success"],
              ["warning", "bg-warning"],
              ["danger", "bg-danger"],
              ["info", "bg-info"],
            ].map(([name, cls]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <div className={`h-16 rounded-md ${cls}`} />
                <span className="text-body-sm text-muted">--color-{name}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ---------------- TYPOGRAPHY ---------------- */}
        <Section id="typography" title="Typography" description="Fraunces for display moments, Plus Jakarta Sans for UI and data.">
          <div className="flex flex-col gap-4">
            <p className="font-display text-display-lg">Handcrafted in gold</p>
            <p className="font-display text-display">Handcrafted in gold</p>
            <p className="font-display text-h1">Heading 1 — collection title</p>
            <p className="text-h2">Heading 2 — section title</p>
            <p className="text-h3">Heading 3 — card title</p>
            <p className="text-h4">Heading 4 — subsection</p>
            <p className="text-body-lg">Body large — intro copy for storefront pages.</p>
            <p className="text-body">Body — default paragraph and UI text.</p>
            <p className="text-body-sm text-muted">Body small — secondary/help text.</p>
            <p className="text-caption text-muted">Caption — labels, timestamps, table headers.</p>
            <p className="tabular text-data">₹1,18,000.00 · 18.420 g — tabular numerals for data columns</p>
          </div>
        </Section>

        {/* ---------------- ACTIONS & FORMS ---------------- */}
        <Section id="actions" title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link button</Button>
            <Button variant="primary" loading>
              Saving
            </Button>
            <Button variant="secondary" size="sm">
              Small
            </Button>
            <Button variant="secondary" size="icon" aria-label="Settings">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </Section>

        <Section id="forms" title="Form controls" description="All inputs share one focus/error treatment via FormField.">
          <FormSection title="New purchase order" description="Example form composed from the shared primitives.">
            <FormField label="Customer" htmlFor="customer" required hint="Search by name or GSTIN">
              <Combobox
                aria-label="Customer"
                value={customer}
                onValueChange={setCustomer}
                placeholder="Select customer…"
                options={[
                  { value: "c1", label: "Anand Jewellers", description: "Retailer · Surat" },
                  { value: "c2", label: "Meera Gems Pvt. Ltd.", description: "Wholesaler · Mumbai" },
                  { value: "c3", label: "Royal Ornaments", description: "Retailer · Jaipur" },
                ]}
              />
            </FormField>
            <FormField label="Metal &amp; purity" htmlFor="metal">
              <Select value={metal} onValueChange={setMetal}>
                <SelectTrigger id="metal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gold-22k">Gold · 22K</SelectItem>
                  <SelectItem value="gold-18k">Gold · 18K</SelectItem>
                  <SelectItem value="silver-925">Silver · 925</SelectItem>
                  <SelectItem value="platinum-950">Platinum · PT950</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Expected delivery" htmlFor="delivery">
              <DatePicker value={date} onValueChange={setDate} aria-label="Expected delivery" />
            </FormField>
            <FormField label="Order value" htmlFor="order-value">
              <CurrencyInput id="order-value" value={amount} onValueChange={setAmount} />
            </FormField>
            <FormField label="Net weight" htmlFor="net-weight">
              <WeightInput id="net-weight" value={weight} onValueChange={setWeight} />
            </FormField>
            <FormField label="Wastage" htmlFor="wastage" hint="Applied on net metal weight">
              <PercentageInput id="wastage" value={wastage} onValueChange={setWastage} />
            </FormField>
            <FormField label="Search inventory" htmlFor="search-inv">
              <SearchInput id="search-inv" value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} />
            </FormField>
            <FormField label="Notes" htmlFor="notes" error={undefined} hint="Optional">
              <Textarea id="notes" placeholder="Internal remarks…" />
            </FormField>
            <FormField label="Invalid example" htmlFor="invalid-example" error="This field is required">
              <Input id="invalid-example" invalid placeholder="Required field" />
            </FormField>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox id="confirm-po" />
              <Label htmlFor="confirm-po">Notify customer once approved</Label>
            </div>
          </FormSection>
        </Section>

        {/* ---------------- BADGES & STATUS ---------------- */}
        <Section id="feedback" title="Badges &amp; status">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">Neutral</Badge>
              <Badge variant="primary">Primary</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Danger</Badge>
              <Badge variant="info">Info</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <StatusBadge tone="success" label="Balanced" />
              <StatusBadge tone="warning" label="Pending review" />
              <StatusBadge tone="danger" label="Discrepancy" />
              <StatusBadge tone="info" label="In progress" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {(["AVAILABLE", "RESERVED", "SOLD", "WITH_JOB_WORKER", "HALLMARKING", "DAMAGED"] as const).map((s) => (
                <InventoryStatusBadge key={s} status={s} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {(["DRAFT", "PENDING_PAYMENT", "CONFIRMED", "FULFILLED", "CANCELLED"] as const).map((s) => (
                <OrderStatusBadge key={s} status={s} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <HUIDDisplay hallmarkingStatus="HALLMARKED" huid="HK8X2M4T" />
              <HUIDDisplay hallmarkingStatus="PENDING" />
              <HUIDDisplay hallmarkingStatus="NOT_APPLICABLE" />
            </div>
            <Alert variant="info" title="Metal rate updated">
              Gold 22K rate refreshed 4 minutes ago. Live prices on the storefront reflect this automatically.
            </Alert>
            <Alert variant="warning" title="Job work discrepancy">
              Issued weight exceeds returned + finished + wastage by 0.42g. Review before closing this job work order.
            </Alert>
          </div>
        </Section>

        {/* ---------------- CARDS & METRICS ---------------- */}
        <Section id="cards" title="Cards &amp; metrics">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Today's sales" value="₹8,42,300" change={{ value: "12.4%", direction: "up" }} icon={<Banknote className="h-4 w-4" />} />
            <MetricCard label="Outstanding (B2B)" value="₹24,10,000" change={{ value: "3.1%", direction: "down", tone: "positive" }} icon={<Users className="h-4 w-4" />} />
            <MetricCard label="Items with job worker" value="18" icon={<Package className="h-4 w-4" />} />
            <MetricCard label="Pending hallmarking" value="7" change={{ value: "2 new", direction: "up", tone: "negative" }} icon={<ShieldCheck className="h-4 w-4" />} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Gold 22K</CardTitle>
                <CardDescription>Live metal rate feed</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <MetalRateDisplay metalType="GOLD" purity="22K" ratePerGram={6842} asOf="10:32 AM" change={{ percent: 0.8, direction: "up" }} />
                <MetalRateDisplay metalType="SILVER" purity="999" ratePerGram={86.5} asOf="10:32 AM" change={{ percent: 0.3, direction: "down" }} />
                <MetalRateDisplay metalType="PLATINUM" purity="PT950" ratePerGram={3210} asOf="10:32 AM" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Anand Jewellers</CardTitle>
                <CardDescription>B2B credit account</CardDescription>
              </CardHeader>
              <CardContent>
                <CreditLimitIndicator creditLimit={2500000} outstanding={2180000} overdueAmount={64000} />
              </CardContent>
            </Card>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Weight breakdown</CardTitle>
                <CardDescription>INV-1002 · Zaira Necklace 18K</CardDescription>
              </CardHeader>
              <CardContent>
                <WeightBreakdown gross={38.6} stone={4.5} netMetal={34.1} fineMetal={30.69} />
                <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
                  <span className="text-body-sm text-muted">Margin (cost vs. price)</span>
                  <MarginDisplay cost={168000} sellingPrice={214000} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Price snapshot</CardTitle>
                <CardDescription>Immutable — captured at time of sale</CardDescription>
              </CardHeader>
              <CardContent>
                <PriceBreakdown
                  rows={[
                    { label: "Metal value (34.100g × ₹6,842)", amount: 233332 },
                    { label: "Making charge (12%)", amount: 27999 },
                    { label: "Stone value", amount: 18500 },
                    { label: "Discount", amount: 8500, negative: true },
                    { label: "CGST (1.5%)", amount: 4088, muted: true },
                    { label: "SGST (1.5%)", amount: 4088, muted: true },
                  ]}
                  total={279507}
                />
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* ---------------- DATA & TABLES ---------------- */}
        <Section id="data" title="Data &amp; tables" description="Dense on desktop, stacked cards on mobile — resize the window to see it collapse.">
          <DataToolbar
            left={
              <>
                <SearchInput placeholder="Search inventory…" className="max-w-xs" />
                <FilterBar
                  controls={
                    <>
                      <Badge variant="outline">Status: Available</Badge>
                      <Badge variant="outline">Location: Main Store</Badge>
                    </>
                  }
                />
              </>
            }
            right={<Button variant="primary" size="sm">New item</Button>}
          />
          <DataTable
            columns={columns}
            data={mockInventory}
            getRowId={(r) => r.id}
            selectable
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            mobileTitle={(r) => r.itemCode}
            onRowClick={() => setDetailOpen(true)}
          />
          <div className="mt-4">
            <Pagination page={page} pageCount={12} onPageChange={setPage} summary="Showing 1–5 of 58" />
          </div>
          <div className="mt-6 flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setLoadingDemo((v) => !v)}>
              Toggle loading skeleton
            </Button>
          </div>
          {loadingDemo && (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          <div className="mt-6">
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="No purchase orders yet"
              description="Purchase orders raised by B2B customers will appear here."
              action={<Button variant="secondary">Create purchase order</Button>}
            />
          </div>
          <BulkActionBar
            selectedCount={selectedIds.size}
            onClear={() => setSelectedIds(new Set())}
            actions={
              <>
                <Button variant="secondary" size="sm">
                  Transfer
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
                  Write off
                </Button>
              </>
            }
          />
        </Section>

        {/* ---------------- NAVIGATION ---------------- */}
        <Section id="navigation" title="Navigation">
          <div className="flex flex-col gap-6">
            <Breadcrumb items={[{ label: "Inventory", href: "#" }, { label: "Finished jewellery", href: "#" }, { label: "INV-1002" }]} />
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="ledger">Ledger</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <p className="text-body-sm text-muted">Item detail, weights and current status.</p>
              </TabsContent>
              <TabsContent value="ledger">
                <p className="text-body-sm text-muted">Full append-only movement history for this item.</p>
              </TabsContent>
              <TabsContent value="documents">
                <p className="text-body-sm text-muted">Hallmarking certificate, invoice, and job work note.</p>
              </TabsContent>
            </Tabs>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary">
                    <LayoutGrid className="h-4 w-4" /> Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Inventory item</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Truck className="h-4 w-4" /> Transfer location
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <RotateCcw className="h-4 w-4" /> Send for repair
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
                    Write off as scrap
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Hallmarking info">
                    <BadgeCheck className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>HUID recorded at hallmarking receipt</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </Section>

        {/* ---------------- OVERLAYS ---------------- */}
        <Section id="overlays" title="Dialogs, drawers &amp; toasts">
          <div className="flex flex-wrap items-center gap-3">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary">Open dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record payment</DialogTitle>
                  <DialogDescription>Allocate this payment against one or more open invoices.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                  <FormField label="Amount received" htmlFor="dialog-amount">
                    <CurrencyInput id="dialog-amount" />
                  </FormField>
                </div>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={() => setDialogOpen(false)}>
                    Save payment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              Delete product
            </Button>
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Write off this item?"
              description="This moves the item to SCRAP status via a new ledger entry. This cannot be undone."
              confirmLabel="Write off"
              onConfirm={() => setConfirmOpen(false)}
            />

            <Button variant="secondary" onClick={() => setDrawerSide("right")}>
              Right drawer
            </Button>
            <Button variant="secondary" onClick={() => setDrawerSide("left")}>
              Left drawer
            </Button>
            <Button variant="secondary" onClick={() => setDrawerSide("bottom")}>
              Bottom sheet
            </Button>
            <Drawer open={drawerSide !== null} onOpenChange={(o) => !o && setDrawerSide(null)}>
              <DrawerContent side={drawerSide ?? "right"}>
                <DrawerHeader>
                  <DrawerTitle>Filter inventory</DrawerTitle>
                </DrawerHeader>
                <DrawerBody>
                  <p className="text-body-sm text-muted">Drawer content — filters, cart lines, or record details depending on context.</p>
                </DrawerBody>
                <DrawerFooter>
                  <Button variant="primary" onClick={() => setDrawerSide(null)}>
                    Apply
                  </Button>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>

            <Button variant="secondary" onClick={() => setDetailOpen(true)}>
              Open detail panel
            </Button>
            <DetailPanel
              open={detailOpen}
              onOpenChange={setDetailOpen}
              title="INV-1002 · Zaira Necklace 18K"
              description="Finished jewellery · Main Store"
              footer={
                <Button variant="primary" className="w-full" onClick={() => setDetailOpen(false)}>
                  Close
                </Button>
              }
            >
              <div className="flex flex-col gap-4">
                <WeightBreakdown gross={38.6} stone={4.5} netMetal={34.1} fineMetal={30.69} />
                <HUIDDisplay hallmarkingStatus="HALLMARKED" huid="HK8X2M4T" />
                <InventoryStatusBadge status="RESERVED" />
              </div>
            </DetailPanel>

            <Button
              variant="secondary"
              onClick={() =>
                toast({ title: "Payment recorded", description: "₹2,14,000 allocated to invoice INV-2024-0341.", variant: "success" })
              }
            >
              Success toast
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast({ title: "Reservation failed", description: "This item was just reserved by another order.", variant: "danger" })
              }
            >
              Error toast
            </Button>
          </div>
        </Section>

        {/* ---------------- JEWELLERY-SPECIFIC / STOREFRONT PREVIEW ---------------- */}
        <Section id="jewellery" title="Jewellery-specific &amp; storefront components" description="See the dedicated storefront preview for full-page composition (product grid, gallery, cart, checkout).">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <p className="mb-2 text-body-sm font-medium text-foreground">Purity badges</p>
              <div className="flex gap-2">
                <PurityBadge purity="22K" metalType="GOLD" />
                <PurityBadge purity="18K" metalType="GOLD" />
                <PurityBadge purity="925" metalType="SILVER" />
                <PurityBadge purity="PT950" metalType="PLATINUM" />
              </div>
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-body-sm font-medium text-foreground">Stock locations</p>
              <div className="flex flex-col gap-2">
                <StockLocationBadge name="Main Store" type="STORE" />
                <StockLocationBadge name="Central Warehouse" type="WAREHOUSE" />
                <StockLocationBadge name="Karigar — Zaveri Bazaar" type="JOB_WORKER" />
              </div>
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-body-sm font-medium text-foreground">Currency &amp; weight</p>
              <div className="flex flex-col gap-1">
                <CurrencyDisplay amount={214000} size="lg" />
                <CurrencyDisplay amount={8500} tone="danger" />
                <CurrencyDisplay amount={16000} tone="success" />
              </div>
            </Card>
          </div>
        </Section>

        <p className="pt-8 text-center text-caption text-muted">
          Storefront-specific composition (ProductGrid, ProductGallery, CartDrawer, CheckoutSummary, StoreHeader/Footer) is previewed on{" "}
          <a href="/showcase/storefront" className="text-primary underline-offset-2 hover:underline">
            /showcase/storefront
          </a>
          . ERP shell composition (Sidebar, Topbar, ERPLayout, MobileNavigation) is previewed on{" "}
          <a href="/showcase/erp-shell" className="text-primary underline-offset-2 hover:underline">
            /showcase/erp-shell
          </a>
          .
        </p>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        groups={[
          {
            heading: "Navigate",
            items: [
              { id: "inv", label: "Inventory", description: "Browse physical stock", icon: <Package className="h-4 w-4" />, onSelect: () => {} },
              { id: "cust", label: "Customers", description: "B2B & B2C directory", icon: <Users className="h-4 w-4" />, onSelect: () => {} },
            ],
          },
          {
            heading: "Quick actions",
            items: [
              { id: "new-po", label: "New purchase order", shortcut: "⌘P", onSelect: () => {} },
              { id: "new-item", label: "New inventory item", shortcut: "⌘I", onSelect: () => {} },
            ],
          },
        ]}
      />
    </div>
  );
}
