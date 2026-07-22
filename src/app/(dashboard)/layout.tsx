import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import AuthGuard from "@/components/AuthGuard";
import { YearProvider } from "@/components/YearProvider";
import SaveStatusToast from "@/components/SaveStatusToast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <YearProvider>
        <div className="shell">
          <Sidebar />
          <div className="main">
            <Topbar />
            <div className="content page-enter">{children}</div>
          </div>
        </div>
        <SaveStatusToast />
      </YearProvider>
    </AuthGuard>
  );
}
