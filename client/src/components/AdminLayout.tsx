import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useState } from "react";
import { 
  LayoutDashboard, 
  Package, 
  Warehouse, 
  Settings,
  LogOut,
  ShoppingBag,
  Users,
  Star,
  Image,
  Layers,
  Megaphone,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [location, setLocation] = useLocation();
  const { isLoading, isAuthenticated } = useAdminAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("admin");
    setLocation("/admin/ramanifashionlogin");
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-pink-500 border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  const menuItems = [
    { path: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/admin/products", label: "Products", icon: Package },
    { path: "/admin/inventory", label: "Inventory", icon: Warehouse },
    { path: "/admin/orders", label: "Orders", icon: ShoppingBag },
    { path: "/admin/customers", label: "Customers", icon: Users },
    { path: "/admin/reviews", label: "Reviews", icon: Star },
    { path: "/admin/categories", label: "Categories", icon: Layers },
    { path: "/admin/media", label: "Update Images", icon: Image },
    { path: "/admin/announcement", label: "Announcement Bar", icon: Megaphone },
    { path: "/admin/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-pink-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-72' : 'w-0 overflow-hidden'} bg-white dark:bg-gray-800 border-r border-pink-100 dark:border-gray-700 fixed h-full shadow-lg transition-all duration-300 z-30`}>
        <div className="p-6 border-b border-pink-100 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xl">R</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-pink-500 bg-clip-text text-transparent whitespace-nowrap" data-testid="text-admin-title">
                Ramani Admin
              </h1>
              <p className="text-xs text-muted-foreground">Fashion Management</p>
            </div>
          </div>
        </div>
        
        <nav className="px-4 py-6 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className={`w-full justify-start whitespace-nowrap ${isActive ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white hover:from-pink-600 hover:to-pink-700' : 'hover:bg-pink-50 dark:hover:bg-gray-700'}`}
                  data-testid={`link-${item.label.toLowerCase()}`}
                >
                  <Icon className="mr-3 h-4 w-4 flex-shrink-0" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-72 p-4 border-t border-pink-100 dark:border-gray-700 bg-white dark:bg-gray-800">
          <Button
            variant="outline"
            className="w-full justify-start border-pink-200 hover:bg-pink-50 hover:border-pink-300 dark:border-gray-600 dark:hover:bg-gray-700"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="mr-3 h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Sidebar toggle button — vertically centered on the sidebar edge */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={`fixed top-1/2 -translate-y-1/2 z-40 flex items-center justify-center w-6 h-6 rounded-full bg-white border border-pink-200 shadow-md hover:bg-pink-50 transition-all duration-300 ${sidebarOpen ? 'left-[270px]' : 'left-0'}`}
        title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        data-testid="button-toggle-sidebar"
      >
        {sidebarOpen ? <ChevronLeft className="h-3.5 w-3.5 text-pink-500" /> : <ChevronRight className="h-3.5 w-3.5 text-pink-500" />}
      </button>

      {/* Main content */}
      <main className={`${sidebarOpen ? 'ml-72' : 'ml-0'} flex-1 transition-all duration-300`}>
        {children}
      </main>
    </div>
  );
}
