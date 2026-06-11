import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Eye, Package, CheckCircle, XCircle, PackageCheck, Banknote, TrendingUp, Clock, Loader2, IndianRupee, Copy, CopyCheck } from "lucide-react";

interface Order {
  _id: string;
  orderNumber: string;
  userId: {
    _id: string;
    name: string;
    email: string;
    phone: string;
  };
  items: Array<{
    productId: string;
    name: string;
    description?: string;
    price: number;
    quantity: number;
    image?: string;
    selectedColor?: string;
    selectedSize?: string;
  }>;
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    locality: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
  };
  subtotal: number;
  shippingCharges: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: string;
  paymentStatus: 'pending' | 'paid' | 'failed';
  orderStatus: 'pending' | 'approved' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  phonePeTransactionId?: string;
  phonePeMerchantOrderId?: string;
  phonePeOrderId?: string;
  phonePePaymentState?: string;
  phonePePaymentDetails?: any;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface OrdersResponse {
  orders: Order[];
  totalRevenue: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

const getStatusColor = (status: string, type: 'order' | 'payment') => {
  if (type === 'order') {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-cyan-100 text-cyan-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'shipped': return 'bg-purple-100 text-purple-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  } else {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'paid': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
};

export default function OrderManagement() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const adminToken = localStorage.getItem("adminToken");

  const [searchQuery, setSearchQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionInput, setShowRejectionInput] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.append('search', searchQuery);
    if (orderStatusFilter !== 'all') params.append('orderStatus', orderStatusFilter);
    if (paymentStatusFilter !== 'all') params.append('paymentStatus', paymentStatusFilter);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    params.append('sort', sortBy);
    params.append('order', sortOrder);
    params.append('page', currentPage.toString());
    params.append('limit', '20');
    return params.toString();
  }, [searchQuery, orderStatusFilter, paymentStatusFilter, startDate, endDate, sortBy, sortOrder, currentPage]);

  const { data: ordersData, isLoading } = useQuery<OrdersResponse>({
    queryKey: ['/api/admin/orders', queryParams],
    queryFn: async () => {
      const response = await apiRequest(`/api/admin/orders?${queryParams}`, "GET");
      return response;
    },
    enabled: !!adminToken,
    refetchInterval: 30000,
  });

  const approveOrderMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest(`/api/admin/orders/${orderId}/approve-only`, "POST"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({ title: "Order approved!", description: "You can now send it to a shipping partner." });
      setDetailDialogOpen(false);
      setSelectedOrder(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const markDeliveredMutation = useMutation({
    mutationFn: ({ orderId, paymentReceived }: { orderId: string; paymentReceived?: boolean }) =>
      apiRequest(`/api/admin/orders/${orderId}/deliver`, "POST", { paymentReceived: paymentReceived ?? false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({ title: "Order marked as delivered!" });
      setDetailDialogOpen(false);
      setSelectedOrder(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const rejectOrderMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      apiRequest(`/api/admin/orders/${orderId}/reject`, "POST", { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({ title: "Order rejected successfully!" });
      setDetailDialogOpen(false);
      setSelectedOrder(null);
      setRejectionReason("");
      setShowRejectionInput(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updatePaymentStatusMutation = useMutation({
    mutationFn: ({ orderId, paymentStatus }: { orderId: string; paymentStatus: string }) =>
      apiRequest(`/api/admin/orders/${orderId}/payment-status`, "PATCH", { paymentStatus }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/orders'] });
      toast({ title: "Payment status updated!" });
      setSelectedOrder(data);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const getDisplayPaymentStatus = (order: Order): string => {
    if (order.orderStatus === 'cancelled' && order.paymentStatus === 'pending' && order.paymentMethod === 'cod') {
      return 'cancelled';
    }
    return order.paymentStatus;
  };

  const handleViewDetails = async (orderId: string) => {
    try {
      const order = await apiRequest(`/api/admin/orders/${orderId}`, "GET");
      setSelectedOrder(order);
      setDetailDialogOpen(true);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleRejectOrder = () => {
    if (!selectedOrder || !rejectionReason.trim()) {
      toast({ title: "Error", description: "Please provide a rejection reason", variant: "destructive" });
      return;
    }
    rejectOrderMutation.mutate({ orderId: selectedOrder._id, reason: rejectionReason });
  };

  const stats = useMemo(() => {
    if (!ordersData?.orders) return { total: 0, pending: 0, processing: 0, revenue: 0 };
    const orders = ordersData.orders;
    return {
      total: ordersData.pagination.total,
      pending: orders.filter(o => o.orderStatus === 'pending').length,
      processing: orders.filter(o => o.orderStatus === 'processing').length,
      revenue: ordersData.totalRevenue ?? 0
    };
  }, [ordersData]);

  if (!adminToken) {
    setLocation("/login");
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">

        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Order Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage all customer orders</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Orders</p>
                <p className="text-xl font-bold" data-testid="text-total-orders">{stats.total}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-yellow-50 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-yellow-600" data-testid="text-pending-orders">{stats.pending}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <Loader2 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Processing</p>
                <p className="text-xl font-bold text-purple-600" data-testid="text-processing-orders">{stats.processing}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <IndianRupee className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-xl font-bold text-green-600" data-testid="text-revenue">₹{stats.revenue.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  data-testid="input-search"
                  placeholder="Order #, customer, email..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="pl-8"
                />
              </div>

              <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
                const [field, order] = value.split('-');
                setSortBy(field);
                setSortOrder(order);
                setCurrentPage(1);
              }}>
                <SelectTrigger data-testid="select-sort">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt-desc">Newest First</SelectItem>
                  <SelectItem value="createdAt-asc">Oldest First</SelectItem>
                  <SelectItem value="total-desc">Highest Amount</SelectItem>
                  <SelectItem value="total-asc">Lowest Amount</SelectItem>
                </SelectContent>
              </Select>

              <Select value={orderStatusFilter} onValueChange={(value) => { setOrderStatusFilter(value); setCurrentPage(1); }}>
                <SelectTrigger data-testid="select-order-status">
                  <SelectValue placeholder="Order Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              <Select value={paymentStatusFilter} onValueChange={(value) => { setPaymentStatusFilter(value); setCurrentPage(1); }}>
                <SelectTrigger data-testid="select-payment-status">
                  <SelectValue placeholder="Payment Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">From:</Label>
                <Input
                  data-testid="input-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                  className="w-36 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">To:</Label>
                <Input
                  data-testid="input-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                  className="w-36 text-sm"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery(""); setOrderStatusFilter("all"); setPaymentStatusFilter("all");
                  setStartDate(""); setEndDate(""); setSortBy("createdAt"); setSortOrder("desc"); setCurrentPage(1);
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Orders Table */}
        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 opacity-40" />
              <p className="text-sm">Loading orders...</p>
            </CardContent>
          </Card>
        ) : !ordersData?.orders || ordersData.orders.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">No orders found matching your filters</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="font-semibold pl-4">Order #</TableHead>
                      <TableHead className="font-semibold">Customer</TableHead>
                      <TableHead className="font-semibold text-center">Items</TableHead>
                      <TableHead className="font-semibold">Amount</TableHead>
                      <TableHead className="font-semibold">Order Status</TableHead>
                      <TableHead className="font-semibold">Payment</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold text-center pr-4">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersData.orders.map((order) => (
                      <TableRow key={order._id} className="hover:bg-muted/30 align-middle" data-testid={`row-order-${order._id}`}>
                        <TableCell className="pl-4 py-3">
                          <span className="font-mono text-sm font-semibold" data-testid={`text-order-number-${order._id}`}>
                            {order.orderNumber}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <div>
                            <p className="font-medium text-sm leading-tight" data-testid={`text-customer-name-${order._id}`}>
                              {order.userId?.name || order.shippingAddress?.fullName || 'Unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground leading-tight" data-testid={`text-customer-email-${order._id}`}>
                              {order.userId?.email || order.shippingAddress?.phone || ''}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-center">
                          <span className="text-sm" data-testid={`text-items-count-${order._id}`}>
                            {order.items.length}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="font-semibold text-sm" data-testid={`text-total-${order._id}`}>
                            ₹{order.total.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge className={`text-xs ${getStatusColor(order.orderStatus, 'order')}`} data-testid={`badge-order-status-${order._id}`}>
                            {order.orderStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge className={`text-xs ${getStatusColor(getDisplayPaymentStatus(order), 'payment')}`} data-testid={`badge-payment-status-${order._id}`}>
                            {getDisplayPaymentStatus(order)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-sm text-muted-foreground" data-testid={`text-date-${order._id}`}>
                            {format(new Date(order.createdAt), 'dd MMM yyyy')}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-center pr-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-pink-50 hover:text-pink-600"
                            onClick={() => handleViewDetails(order._id)}
                            data-testid={`button-view-${order._id}`}
                            title="View Order Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pagination */}
        {ordersData && ordersData.pagination.pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {ordersData.pagination.page} of {ordersData.pagination.pages} · {ordersData.pagination.total} orders
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} data-testid="button-prev-page">
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(ordersData.pagination.pages, p + 1))} disabled={currentPage === ordersData.pagination.pages} data-testid="button-next-page">
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Order Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={(open) => {
          setDetailDialogOpen(open);
          if (!open) { setShowRejectionInput(false); setRejectionReason(""); }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">
                Order #{selectedOrder?.orderNumber}
              </DialogTitle>
            </DialogHeader>

            {selectedOrder && (
              <div className="space-y-5 pt-1">

                {/* Status Row */}
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Order:</span>
                    <Badge className={getStatusColor(selectedOrder.orderStatus, 'order')}>
                      {selectedOrder.orderStatus}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Payment:</span>
                    <Badge className={getStatusColor(selectedOrder.paymentStatus, 'payment')}>
                      {selectedOrder.paymentStatus}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Method:</span>
                    <span className="text-sm font-medium">{selectedOrder.paymentMethod?.toUpperCase()}</span>
                  </div>
                  <div className="ml-auto text-xs text-muted-foreground">
                    {format(new Date(selectedOrder.createdAt), 'dd MMM yyyy, hh:mm a')}
                  </div>
                </div>

                <Separator />

                {/* Customer + Address */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Customer</p>
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                      <p className="font-semibold">{selectedOrder.userId?.name || selectedOrder.shippingAddress?.fullName || 'Unknown'}</p>
                      <p className="text-muted-foreground">{selectedOrder.userId?.email || 'N/A'}</p>
                      <p className="text-muted-foreground">{selectedOrder.userId?.phone || selectedOrder.shippingAddress?.phone || 'N/A'}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shipping Address</p>
                      <button
                        onClick={() => {
                          const a = selectedOrder.shippingAddress;
                          const parts = [
                            a.fullName,
                            a.address,
                            a.locality,
                            a.landmark ? `Landmark: ${a.landmark}` : null,
                            `${a.city}, ${a.state} – ${a.pincode}`,
                            `Phone: ${a.phone}`
                          ].filter(Boolean);
                          navigator.clipboard.writeText(parts.join('\n'));
                          setAddressCopied(true);
                          setTimeout(() => setAddressCopied(false), 2000);
                        }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                        title="Copy shipping address"
                        data-testid="button-copy-address"
                      >
                        {addressCopied ? (
                          <CopyCheck className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {addressCopied ? <span className="text-green-500">Copied!</span> : <span>Copy</span>}
                      </button>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-0.5">
                      <p className="font-semibold">{selectedOrder.shippingAddress.fullName}</p>
                      <p className="text-muted-foreground">{selectedOrder.shippingAddress.address}, {selectedOrder.shippingAddress.locality}</p>
                      <p className="text-muted-foreground">{selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.state} – {selectedOrder.shippingAddress.pincode}</p>
                      {selectedOrder.shippingAddress.landmark && (
                        <p className="text-muted-foreground">Landmark: {selectedOrder.shippingAddress.landmark}</p>
                      )}
                      <p className="text-muted-foreground">📞 {selectedOrder.shippingAddress.phone}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Order Items */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    Order Items ({selectedOrder.items.length})
                  </p>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <img
                          src={item.image || "/default-saree.jpg"}
                          alt={item.name}
                          className="w-14 h-14 object-cover rounded-md flex-shrink-0 border"
                          onError={(e) => { e.currentTarget.src = '/default-saree.jpg'; }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{item.name}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {item.selectedColor && (
                              <span className="text-xs bg-background border px-2 py-0.5 rounded-full">
                                {item.selectedColor}
                              </span>
                            )}
                            {item.selectedSize && (
                              <span className="text-xs bg-background border px-2 py-0.5 rounded-full font-medium">
                                Size: {item.selectedSize}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Qty {item.quantity} × ₹{item.price.toLocaleString()}
                          </p>
                        </div>
                        <p className="font-semibold text-sm flex-shrink-0">
                          ₹{(item.price * item.quantity).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>₹{selectedOrder.subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Shipping</span>
                    <span>₹{selectedOrder.shippingCharges.toLocaleString()}</span>
                  </div>
                  {selectedOrder.tax > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax</span>
                      <span>₹{selectedOrder.tax.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedOrder.discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span>−₹{selectedOrder.discount.toLocaleString()}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span>₹{selectedOrder.total.toLocaleString()}</span>
                  </div>
                </div>

                {/* PhonePe Details */}
                {selectedOrder.paymentMethod === 'PhonePe' && (selectedOrder.phonePeTransactionId || selectedOrder.phonePeOrderId) && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">PhonePe Details</p>
                    <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-xs text-muted-foreground">
                      {selectedOrder.phonePeTransactionId && <p>Transaction ID: <span className="font-mono text-foreground">{selectedOrder.phonePeTransactionId}</span></p>}
                      {selectedOrder.phonePeOrderId && <p>PhonePe Order ID: <span className="font-mono text-foreground">{selectedOrder.phonePeOrderId}</span></p>}
                      {selectedOrder.phonePePaymentState && <p>State: <span className="font-medium text-foreground">{selectedOrder.phonePePaymentState}</span></p>}
                    </div>
                  </div>
                )}

                {/* Approval / Rejection Info */}
                {selectedOrder.approved && selectedOrder.approvedAt && (
                  <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-sm">
                    <p className="text-green-700 font-medium">✅ Approved by {selectedOrder.approvedBy || 'Admin'}</p>
                    <p className="text-green-600 text-xs mt-0.5">{format(new Date(selectedOrder.approvedAt), 'dd MMM yyyy, hh:mm a')}</p>
                  </div>
                )}

                {selectedOrder.orderStatus === 'cancelled' && selectedOrder.rejectedBy && (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm">
                    <p className="text-red-700 font-medium">❌ Rejected by {selectedOrder.rejectedBy}</p>
                    {selectedOrder.rejectionReason && <p className="text-red-600 text-xs mt-0.5">Reason: {selectedOrder.rejectionReason}</p>}
                  </div>
                )}

                {/* Action Buttons */}
                {!selectedOrder.approved && (selectedOrder.orderStatus === 'pending' || selectedOrder.orderStatus === 'processing') && (
                  <div className="space-y-3 pt-2 border-t">
                    {selectedOrder.paymentMethod !== 'cod' && selectedOrder.paymentStatus !== 'paid' && (
                      <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-100 p-3 rounded-lg">
                        ⚠️ Prepaid order — payment not completed. Cannot approve yet.
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        onClick={() => approveOrderMutation.mutate(selectedOrder._id)}
                        disabled={approveOrderMutation.isPending || (selectedOrder.paymentMethod !== 'cod' && selectedOrder.paymentStatus !== 'paid')}
                        className="flex-1 min-w-[120px]"
                        data-testid="button-approve-order"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {approveOrderMutation.isPending ? 'Approving...' : 'Approve Order'}
                      </Button>
                      {selectedOrder.paymentMethod === 'cod' && (
                        <Button
                          variant="destructive"
                          onClick={() => setShowRejectionInput(!showRejectionInput)}
                          disabled={rejectOrderMutation.isPending}
                          className="flex-1 min-w-[120px]"
                          data-testid="button-reject-order"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          {showRejectionInput ? 'Cancel' : 'Reject'}
                        </Button>
                      )}
                    </div>
                    {showRejectionInput && (
                      <div className="space-y-2">
                        <Input
                          placeholder="Reason for rejection..."
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          data-testid="input-rejection-reason"
                        />
                        <Button
                          variant="destructive"
                          onClick={handleRejectOrder}
                          disabled={rejectOrderMutation.isPending || !rejectionReason.trim()}
                          className="w-full"
                          data-testid="button-confirm-reject"
                        >
                          {rejectOrderMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {selectedOrder.approved && selectedOrder.orderStatus !== 'delivered' && selectedOrder.orderStatus !== 'cancelled' && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="text-sm text-green-700 bg-green-50 border border-green-100 p-3 rounded-lg">
                      ✅ Order approved. Mark as delivered once the customer receives it.
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        onClick={() => markDeliveredMutation.mutate({ orderId: selectedOrder._id, paymentReceived: false })}
                        disabled={markDeliveredMutation.isPending}
                        className="flex-1 min-w-[140px]"
                        data-testid="button-mark-delivered"
                      >
                        <PackageCheck className="h-4 w-4 mr-2" />
                        {markDeliveredMutation.isPending ? 'Updating...' : 'Mark Delivered'}
                      </Button>
                      {selectedOrder.paymentMethod === 'cod' && (
                        <Button
                          variant="outline"
                          onClick={() => markDeliveredMutation.mutate({ orderId: selectedOrder._id, paymentReceived: true })}
                          disabled={markDeliveredMutation.isPending}
                          className="flex-1 min-w-[180px] border-green-500 text-green-700 hover:bg-green-50"
                          data-testid="button-mark-delivered-payment-received"
                        >
                          <Banknote className="h-4 w-4 mr-2" />
                          {markDeliveredMutation.isPending ? 'Updating...' : 'Delivered + Payment Received'}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {selectedOrder.orderStatus === 'delivered' && selectedOrder.paymentStatus === 'pending' && selectedOrder.paymentMethod === 'cod' && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-100 p-3 rounded-lg">
                      💰 Delivered but payment not yet collected. Update when received.
                    </div>
                    <Button
                      onClick={() => updatePaymentStatusMutation.mutate({ orderId: selectedOrder._id, paymentStatus: 'paid' })}
                      disabled={updatePaymentStatusMutation.isPending}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      data-testid="button-mark-payment-received"
                    >
                      <Banknote className="h-4 w-4 mr-2" />
                      {updatePaymentStatusMutation.isPending ? 'Updating...' : 'Mark Payment Received'}
                    </Button>
                  </div>
                )}

              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </AdminLayout>
  );
}
