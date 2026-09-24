import { ReportView } from "../../../../components/reports/report-view";

export default function ReportDetailPage({ params }: { params: { key: string } }) {
  return <ReportView reportKey={params.key} />;
}
